import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TicketStatus =
  | "aguardando"
  | "aguardando_agendamento"
  | "agendado"
  | "em_atendimento"
  | "em_manutencao"
  | "pendente_conclusao"
  | "aguardando_verificacao"
  | "pendente_aprovacao"
  | "pronto_entrega"
  | "finalizado";
export type TicketPriority = "baixa" | "media" | "alta";

/**
 * Cast an app-level TicketStatus to the DB enum type. The generated Supabase
 * types may lag behind newly added ENUM values (e.g. 'aguardando_verificacao',
 * 'pendente_aprovacao') until the migration regenerates them, so this bridges
 * the gap for update/insert payloads.
 */
export type DbTicketStatus = Database["public"]["Enums"]["ticket_status"];
export const asDbStatus = (s: TicketStatus): DbTicketStatus =>
  s as unknown as DbTicketStatus;

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aguardando: "Aberto",
  aguardando_agendamento: "Aguardando Agendamento",
  agendado: "Agendado",
  em_atendimento: "Em Atendimento",
  em_manutencao: "Em Manutenção",
  pendente_conclusao: "Pendente de Conclusão",
  aguardando_verificacao: "Aguardando Verificação",
  pendente_aprovacao: "Pendente de Aprovação",
  pronto_entrega: "Pronto para Entrega",
  finalizado: "Finalizado",
};

/** Status that any user can choose when launching or changing a ticket. */
export const ALL_STATUSES: TicketStatus[] = [
  "aguardando",
  "aguardando_agendamento",
  "agendado",
  "em_atendimento",
  "em_manutencao",
  "pronto_entrega",
  "finalizado",
];

/** Create a temporary signed URL for a private storage object path. */
export async function signedUrl(
  bucket: string,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
