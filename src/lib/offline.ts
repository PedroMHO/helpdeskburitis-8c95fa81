import { get, set, del, createStore, type UseStore } from "idb-keyval";
import {
  persistQueryClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";

/**
 * OFFLINE-FIRST ARCHITECTURE (HelpDesk Buritis)
 * =============================================
 * Objetivo: permitir leitura de chamados/perfis e enfileiramento de ações
 * quando o dispositivo está sem internet (subsolos, zonas rurais). O app será
 * empacotado via Capacitor / servido como PWA no futuro.
 *
 * 1) Cache de leitura: usamos @tanstack/react-query-persist-client com um
 *    persister baseado em IndexedDB (idb-keyval) para persistir o cache das
 *    queries (listas de tickets, perfis, localidades) e lê-las offline.
 * 2) Fila de mutações: ações feitas offline são gravadas localmente e
 *    ressincronizadas quando a conexão volta (evento window 'online').
 *
 * FUTURO (Capacitor + SQLite):
 *  - Substituir o store IndexedDB por @capacitor-community/sqlite quando rodando
 *    nativamente (Capacitor.isNativePlatform()). A interface `queueMutation` /
 *    `flushMutationQueue` deve permanecer estável para essa troca.
 */

// Store dedicado no IndexedDB para não colidir com outros dados do app.
const store: UseStore | undefined =
  typeof indexedDB !== "undefined"
    ? createStore("helpdesk-offline", "keyval")
    : undefined;

const CACHE_KEY = "rq-cache";
const QUEUE_KEY = "mutation-queue";

/** Persister do React Query gravando o cache serializado no IndexedDB. */
function createIdbPersister(): Persister {
  return {
    persistClient: async (client) => {
      if (!store) return;
      // Serializamos em JSON: o structured clone do IndexedDB falha com
      // valores não clonáveis (ex.: promises dentro do cache do Query).
      try {
        await set(CACHE_KEY, JSON.stringify(client), store);
      } catch {
        // cache não serializável — ignoramos silenciosamente
      }
    },
    restoreClient: async () => {
      if (!store) return undefined;
      const raw = await get(CACHE_KEY, store);
      if (!raw) return undefined;
      try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return undefined;
      }
    },

    removeClient: async () => {
      if (!store) return;
      await del(CACHE_KEY, store);
    },
  };
}

/** Ação de mutação pendente aguardando sincronização. */
export interface QueuedMutation {
  id: string;
  /** Identificador lógico da operação, ex.: "ticket.update", "ticket.create". */
  type: string;
  /** Payload arbitrário serializável para reexecutar a ação. */
  payload: unknown;
  createdAt: number;
}

/** Adiciona uma mutação à fila local (chamado quando navigator.onLine === false). */
export async function queueMutation(
  type: string,
  payload: unknown,
): Promise<void> {
  if (!store) return;
  const queue = ((await get(QUEUE_KEY, store)) as QueuedMutation[]) ?? [];
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    createdAt: Date.now(),
  });
  await set(QUEUE_KEY, queue, store);
}

export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  if (!store) return [];
  return ((await get(QUEUE_KEY, store)) as QueuedMutation[]) ?? [];
}

/**
 * Handler que sabe reexecutar uma mutação enfileirada contra o backend.
 * Registre implementações reais (Supabase) via `registerMutationHandler`.
 */
export type MutationHandler = (payload: unknown) => Promise<void>;
const handlers = new Map<string, MutationHandler>();

export function registerMutationHandler(type: string, handler: MutationHandler) {
  handlers.set(type, handler);
}

/**
 * Esvazia a fila, executando cada mutação pendente. Itens sem handler
 * registrado são mantidos para uma tentativa futura.
 */
export async function flushMutationQueue(): Promise<void> {
  if (!store || !navigator.onLine) return;
  const queue = await getQueuedMutations();
  if (queue.length === 0) return;

  const remaining: QueuedMutation[] = [];
  for (const item of queue) {
    const handler = handlers.get(item.type);
    if (!handler) {
      remaining.push(item);
      continue;
    }
    try {
      await handler(item.payload);
    } catch {
      // Falha (rede/servidor): mantém na fila para nova tentativa.
      remaining.push(item);
    }
  }
  await set(QUEUE_KEY, remaining, store);
}

let initialized = false;

/**
 * Inicializa a camada offline no cliente:
 *  - restaura/persiste o cache do React Query no IndexedDB;
 *  - dispara a sincronização da fila quando a conexão volta.
 * Deve ser chamado uma única vez, apenas no browser.
 */
export function setupOfflineSupport(queryClient: QueryClient): void {
  if (initialized || typeof window === "undefined" || !store) return;
  initialized = true;

  persistQueryClient({
    // Cast: duplicate (identical-version) query-core copies are nominally
    // distinct to TS but runtime-compatible.
    queryClient: queryClient as never,
    persister: createIdbPersister(),
    maxAge: 1000 * 60 * 60 * 24, // 24h de cache offline
    // Apenas listas de leitura são úteis offline.
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        const key = query.queryKey?.[0];
        return (
          key === "tickets" ||
          key === "profiles" ||
          key === "tecnicos" ||
          key === "localidades"
        );
      },
    },
  });

  // Quando a internet voltar, sincroniza a fila e revalida os dados.
  window.addEventListener("online", () => {
    void flushMutationQueue().then(() => {
      queryClient.invalidateQueries();
    });
  });

  // Tentativa inicial (caso o app abra já online com fila pendente).
  if (navigator.onLine) void flushMutationQueue();
}
