# AI_CONTEXT.md — HelpDesk Buritis

> Documento técnico para IAs (Claude, ChatGPT, Cursor, etc.) e desenvolvedores
> humanos entenderem, executarem e evoluírem este projeto **fora da plataforma
> Lovable**, em VPS / máquina dedicada. Leia este arquivo por completo antes de
> alterar qualquer código.

---

## 1. Visão geral

**HelpDesk Buritis** é um sistema de abertura e gestão de chamados (helpdesk /
service desk) com controle de acesso por cargo (RBAC), agendamentos
automatizados, notificações em tempo real (Web/PWA), dashboard analítico e
exportação de dados. Interface com estética "Liquid Glass" (inspirada no iOS).

- **App publicado:** https://helpdeskburitis.lovable.app
- **Idioma da UI:** Português (Brasil)
- **Fuso horário de referência:** America/Sao_Paulo (Brasília)

---

## 2. Stack tecnológica

| Camada        | Tecnologia                                                            |
| ------------- | -------------------------------------------------------------------- |
| Framework     | **TanStack Start v1** (React 19, SSR) sobre **Vite 7**               |
| Roteamento    | File-based routing (`src/routes/`), `routeTree.gen.ts` é gerado      |
| Estilo        | **Tailwind CSS v4** via `src/styles.css` (tokens semânticos)        |
| UI Kit        | shadcn/ui (`src/components/ui/*`) + Radix                            |
| Backend       | **Supabase** (PostgreSQL + Auth + Storage + Realtime + pg_cron)      |
| Server logic  | `createServerFn` (`@tanstack/react-start`), NÃO edge functions       |
| Build server  | Nitro preset `node-server` → saída em `.output/server/index.mjs`     |
| Gerenciador   | **bun** (fallback: npm)                                              |
| Mobile        | PWA (`manifest.webmanifest`) + **Capacitor** (APK Android nativo) — ver seção 12 |
| Offline       | `@tanstack/react-query-persist-client` + `idb-keyval` (cache + fila de mutações) |

> **Importante:** este NÃO é Next.js/Remix. Não use `use server`,
> `getServerSideProps` nem `react-router-dom`. Rotas ficam em `src/routes/`.

---

## 3. Como rodar (VPS / self-hosting)

### Opção A — Docker (recomendado)
```bash
cp .env.example .env      # preencha as variáveis
docker compose up -d --build
# App em http://localhost:3000
```

### Opção B — Node direto
```bash
cp .env.example .env
bun install          # ou npm install
bun run build        # gera .output/
node .output/server/index.mjs   # PORT=3000 por padrão
```

### Opção C — PM2 + Nginx (produção)
Ver `deploy/README.md` (PM2 `ecosystem.config.cjs`, `nginx.conf`, certbot/HTTPS).

---

## 4. Banco de dados

- **Schema completo:** `schema.sql` (raiz) — idêntico a `deploy/supabase/01_schema_completo.sql`.
- Recria tudo do schema `public`: **enums, tabelas, PK/FK, constraints, indexes,
  funções (SECURITY DEFINER), triggers, políticas RLS e GRANTs**.
- Idempotente (`IF NOT EXISTS` / `EXCEPTION WHEN duplicate_object`).

Aplicar em qualquer PostgreSQL / Supabase local:
```bash
psql "$DATABASE_URL" -f schema.sql
# ou automático via serviço `db` do docker-compose (volume initdb)
```

> **Limitações do clone:** o schema `auth` (usuários/senhas) e `storage` são
> gerenciados pelo Supabase e **não** estão no `schema.sql`. Para migrar
> usuários e arquivos use `pg_dump` do projeto de origem (schemas `auth`/`storage`)
> ou a Auth Admin API + cópia de buckets com a service_role key.

### Modelo de dados (schema `public`)
- `profiles` — dados do usuário (vinculado a `auth.users`), inclui `setor_id`.
- `user_roles` — **cargos em tabela separada** (nunca no profile). Enum `app_role`:
  `admin | tecnico | atendente | usuario | solicitante`. Checagem via função
  `has_role(uuid, app_role)` SECURITY DEFINER.
- `tickets` — chamados. Enum `ticket_status`
  (`aguardando | aguardando_agendamento | agendado | em_atendimento |
  em_manutencao | pendente_conclusao | aguardando_verificacao |
  pendente_aprovacao | pronto_entrega | finalizado`) e
  `ticket_priority` (`baixa | media | alta`).
  - `aguardando_verificacao` — chamado escalonado para análise de superior.
  - `pendente_aprovacao` — conflito de encerramento (duplicidade) aguardando
    decisão do admin (Aprovar/Recusar baixa).
- `ticket_history` — histórico de mudanças (guarda `changed_by` e `note`;
  também registra a 2ª tentativa de baixa em conflitos de concorrência).
- `notifications` — notificações por usuário.
- `technician_status` — disponibilidade do técnico (por setor).
- `solicitantes` — solicitantes por setor.
- `device_tokens` — tokens de Push (FCM) por dispositivo, vinculados ao usuário
  (`user_id`, `token`, `platform`). RLS: cada usuário gerencia apenas os seus.
  Preenchido pelo app nativo (Capacitor) após o login. Ver seção 12.
- Hierarquia de localidade: `cidades → bairros → setores`.

### Funções e automações relevantes
- `handle_new_user()` — cria profile ao registrar; 1º usuário vira `admin`.
- `has_role(uuid, app_role)` — checagem de cargo (RPC exposta a `authenticated`).
- `technicians_directory()` / `profiles_directory()` — diretórios seguros (sem expor e-mails), RPCs expostas a `authenticated`.
- `handle_ticket_status_side_effects()` — libera técnico ao sair de atendimento.
- `promote_due_scheduled_tickets()` — pg_cron: promove chamados agendados no dia.
- `send_scheduled_reminders()` — lembrete 24h antes do agendamento.
- `notify_team()` / `notify_ticket_changes()` — geram notificações.
- `enforce_solicitante_rate_limit()` — 1 chamado / 30 min para solicitantes.

> **EXECUTE (segurança):** todas as funções SECURITY DEFINER internas/trigger/cron
> (`handle_new_user`, `set_updated_at`, `notify_ticket_changes`,
> `enforce_solicitante_rate_limit`, `handle_ticket_status_side_effects`,
> `promote_due_scheduled_tickets`, `send_scheduled_reminders`, `notify_team`)
> tiveram `EXECUTE` **revogado** de `PUBLIC`/`anon`/`authenticated`. Apenas
> `has_role`, `profiles_directory` e `technicians_directory` continuam com
> `EXECUTE` para `authenticated` (são RPCs chamadas pelo app). Mantenha isso ao
> recriar o schema.

### Storage
- Bucket **`ticket-proofs`** — imagens de comprovação/encerramento dos chamados.
  Referenciado por `closing_image_url` (caminho relativo dentro do bucket).

---

## 5. Segurança (RBAC + RLS)

- **RLS habilitado** em todas as tabelas do `public`; GRANTs explícitos por role.
- Cargos SEMPRE via `user_roles` + `has_role()` (evita escalonamento de privilégio).
- **Nunca** cheque cargo por localStorage/hardcode no cliente.
- Server functions privilegiadas verificam o cargo do chamador antes de usar
  `supabaseAdmin` (service role). Ver `src/lib/admin-users.functions.ts` e
  `src/lib/db-transfer.functions.ts` (ambas chamam `assertAdmin`/`has_role`).
- Cadastro público desabilitado (login somente).
- **RLS de `tickets`:** a política `tickets_update` tem `WITH CHECK` restritivo —
  solicitantes só editam o próprio chamado sem alterar `status`/técnico
  (impede auto-encerramento, reatribuição e escalonamento de prioridade).
  Cargos de staff e o técnico designado mantêm edição completa. Preserve isso.

---

## 6. Estrutura de pastas

```
.
├── Dockerfile              # build SSR (raiz)
├── docker-compose.yml      # app (+ postgres opcional)
├── .env.example            # variáveis de ambiente
├── schema.sql              # estrutura completa do banco
├── AI_CONTEXT.md           # este arquivo
├── vite.config.ts          # preset node-server
├── deploy/                 # PM2, Nginx, Docker alternativo, guia detalhado
│   └── supabase/01_schema_completo.sql
├── public/                 # assets estáticos servidos por caminho literal
│   ├── manifest.webmanifest
│   ├── notifications-sw.js  # service worker de notificações
│   └── robots.txt
└── src/
    ├── assets/             # assets importados pelo bundler (Vite)
    │   ├── bg-logo.png
    │   └── liquid-glass-bg.jpg
    ├── components/         # componentes + ui/ (shadcn)
    ├── integrations/supabase/  # clients (NÃO editar os auto-gerados)
    ├── lib/                # auth, data, helpdesk, notifications, server fns
    ├── routes/             # rotas (file-based)
    │   ├── __root.tsx      # shell HTML, head, PWA meta
    │   ├── auth.tsx        # login
    │   ├── index.tsx
    │   └── _authenticated/ # rotas protegidas (gate de sessão)
    └── styles.css          # Tailwind v4 + tema Liquid Glass
```

---

## 7. Assets — caminhos e carregamento

- Todos os assets são **locais** (nenhuma dependência de CDN do Lovable).
- **`src/assets/`**: importados pelo bundler. Referência em CSS por caminho
  relativo, ex.: `background-image: url("./assets/liquid-glass-bg.jpg")` em
  `src/styles.css`. Em TSX, importe como módulo (`import x from "@/assets/..."`).
- **`public/`**: servidos por caminho literal a partir da raiz (`/manifest.webmanifest`,
  `/notifications-sw.js`, ícones do PWA).
- Não há carregamento dinâmico via URL de CDN externa — nada quebra por 404 ao
  mudar de host. Ao adicionar assets novos, coloque em `src/assets/` (se
  importado pelo build) ou `public/` (se referenciado por caminho fixo).

---

## 8. Rotas principais

| Rota                              | Acesso                    | Função                          |
| --------------------------------- | ------------------------- | ------------------------------- |
| `/` , `/auth`                     | Público                   | Landing / Login                 |
| `/_authenticated/dashboard`       | Autenticado               | Dashboard + gráficos + feed     |
| `/_authenticated/tickets`         | Autenticado               | Lista/detalhe de chamados       |
| `/_authenticated/tickets/novo`    | Autenticado               | Abertura de chamado             |
| `/_authenticated/agendados`       | Autenticado               | Chamados agendados              |
| `/_authenticated/pendentes`       | Autenticado               | Pendentes de conclusão          |
| `/_authenticated/manutencao`      | Autenticado               | Em manutenção                   |
| `/_authenticated/historico`       | Autenticado               | Histórico                       |
| `/_authenticated/perfil`          | Autenticado               | Perfil + exportação Excel       |
| `/_authenticated/usuarios`,`/config` | Admin/Atendente        | Gestão de usuários e setores    |
| `/_authenticated/admin`           | **Admin apenas**          | Painel isolado (ver seção 8.1)  |
| `/_authenticated/lancamentos`     | Autenticado               | Lançamentos em massa            |
| `/_authenticated/aguardando-verificacao` | Admin/Técnico/Atendente | Chamados escalonados p/ verificação |
| `/_authenticated/pendente-aprovacao` | **Admin apenas**       | Conflitos de encerramento (aprovar/recusar baixa) |

Rotas sob `_authenticated/` são protegidas pelo gate em
`src/routes/_authenticated/route.tsx` (redireciona para `/auth` sem sessão).
O componente do `/admin` faz uma checagem extra: se `!isAdmin`, redireciona para
`/dashboard` (defesa em profundidade — a autorização real está no servidor).

### 8.1 Painel de Administração (`/_authenticated/admin`)

Painel isolado, **acessível apenas por admin**. Componente em
`src/routes/_authenticated/admin.tsx`. Recursos:

1. **Gestão de usuários (CRUD)** — via `src/lib/admin-users.functions.ts`
   (todas com `requireSupabaseAuth` + checagem `has_role(admin)`):
   - `createUserAccount` — cria usuário no Auth (`supabaseAdmin.auth.admin.createUser`)
     e grava o cargo em `user_roles`.
   - `updateUserRole` — troca o cargo (não permite alterar o próprio).
   - `deleteUserAccount` — remove a conta (não permite excluir a si mesmo).
   - A listagem lê `profiles` + `user_roles` no cliente (RLS aplicada).
   - Cargos disponíveis: `admin | tecnico | atendente | usuario | solicitante`.

2. **Relançamento de Banco de Dados** — componente `src/components/DbTransferPanel.tsx`
   (usa `JSZip`) + server fns em `src/lib/db-transfer.functions.ts`
   (admin-only via `assertAdmin`):
   - **Exportar** (`exportTicketsData`): baixa um `.zip` com `chamados.json`
     (chamados finalizados + histórico completo) e pasta `imagens/` (fotos de
     encerramento via signed URLs temporárias do bucket `ticket-proofs`).
   - **Importar** (`importTicket`): lê o `.zip`, recria cada chamado (título,
     descrição, resolução, status, histórico) e re-faz o upload das imagens no
     bucket `ticket-proofs`. Referências a pessoas ausentes usam o admin
     importador como fallback → funciona entre projetos Supabase distintos.

> Requer `JSZip` no `package.json` (dependência do frontend). As server fns usam
> `supabaseAdmin` (service role) — garanta `SUPABASE_SERVICE_ROLE_KEY` no
> ambiente do servidor e o bucket `ticket-proofs` criado no destino.

---

## 9. Variáveis de ambiente

| Variável                        | Escopo   | Uso                                   |
| ------------------------------- | -------- | ------------------------------------- |
| `VITE_SUPABASE_URL`             | Cliente  | URL do Supabase (bundle)              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cliente  | anon key (bundle)                     |
| `VITE_SUPABASE_PROJECT_ID`      | Cliente  | project ref                           |
| `SUPABASE_URL`                  | Servidor | SSR / server functions                |
| `SUPABASE_PUBLISHABLE_KEY`      | Servidor | client server-side (RLS)              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Servidor | admin (bypassa RLS) — **secreto**     |

Regra: `process.env.*` só é lido **dentro** do `.handler()` de uma server
function. `import.meta.env.VITE_*` é para o cliente.

---

## 10. Instruções para IAs continuarem o desenvolvimento

1. **Leia primeiro:** este arquivo → `vite.config.ts` → `src/routes/__root.tsx`
   → `src/lib/auth.tsx` → `src/lib/data.ts` / `src/lib/helpdesk.ts`. Para mobile:
   `src/hooks/useMobileFeatures.ts`, `src/lib/offline.ts` e `capacitor.config.ts`
   (ver seção 12).
2. **Rotas:** crie arquivos em `src/routes/` (convenção flat, ex.
   `posts.$id.tsx`). NUNCA edite `src/routeTree.gen.ts` (gerado). Não use
   `src/pages/`.
3. **Backend/lógica de servidor:** use `createServerFn` de
   `@tanstack/react-start`. Leia segredos dentro do `.handler()`. Não importe
   `*.server.ts` a partir de arquivos de rota/cliente.
4. **Banco:** mudanças de schema devem ser refletidas em `schema.sql`. Toda
   nova tabela em `public` precisa de GRANTs + RLS + políticas.
5. **Cargos:** sempre via `user_roles` + `has_role()`. Nunca no `profiles`.
6. **Estilo:** use tokens semânticos de `src/styles.css` (não hardcode
   `text-white`, `bg-[#...]`). Tema Liquid Glass.
7. **Assets:** `src/assets/` (import pelo build) ou `public/` (caminho fixo).
8. **Verifique antes de concluir:** `bun run build` deve passar (exit 0).
9. **Não** dependa de nenhuma infraestrutura interna do Lovable — o projeto é
   auto-suficiente com as variáveis de ambiente acima.

---

## 11. Checklist de portabilidade (já garantido)

- [x] Assets 100% locais (`src/assets/` e `public/`), sem CDN externa.
- [x] Caminhos de assets relativos.
- [x] `Dockerfile` + `docker-compose.yml` + `.env.example` na raiz.
- [x] `schema.sql` completo e idempotente na raiz.
- [x] Guia de deploy (PM2/Nginx/Docker) em `deploy/`.
- [x] Documentação para IAs (este arquivo).

---

## 12. Mobile nativo (Capacitor / APK Android) + Offline-first

### 12.1 Dependências
Todas já estão em `package.json` (instale com `bun install`):

| Pacote                                   | Uso                                          |
| ---------------------------------------- | -------------------------------------------- |
| `@capacitor/core`                        | Núcleo do Capacitor / detecção de plataforma |
| `@capacitor/camera`                      | Câmera nativa (foto de encerramento no APK)  |
| `@capacitor/push-notifications`          | Push nativo via Firebase (FCM)               |
| `@tanstack/react-query-persist-client`   | Persistência do cache do React Query         |
| `idb-keyval`                             | Store IndexedDB (cache + fila de mutações)   |
| `jszip`                                  | Export/import do "Relançamento de Banco"     |

CLI de build (dev deps, instale ao gerar o APK):
`@capacitor/cli` e `@capacitor/android`.

Config do Capacitor: `capacitor.config.ts` (`appId: app.lovable.helpdeskburitis`,
`webDir: dist`).

### 12.2 Isolamento de código nativo (graceful degradation)
- **`src/hooks/useMobileFeatures.ts`** — serviço unificado. Todos os imports
  dos plugins Capacitor são **dinâmicos** e protegidos por `try/catch`, então o
  bundle web nunca quebra se um plugin não existir.
  - `isNativePlatform()` — usa `Capacitor.isNativePlatform()`.
  - `takeNativePhoto()` — no APK usa `Camera.getPhoto` e converte a URI em Blob;
    na web retorna `null` (o chamador cai no fallback HTML5).
  - `registerPushOnLogin()` / `registerPushNotifications()` — no APK pede
    permissão (`checkPermissions`/`requestPermissions`), registra o listener
    `registration` e faz `upsert` do token FCM em `device_tokens`. No-op na web.
- **Câmera de encerramento** (`src/routes/_authenticated/tickets.$id.tsx`):
  o botão "Tirar Foto do Encerramento" chama `takeNativePhoto()`; se retornar
  `null` (web), dispara o `<input type="file" accept="image/*"
  capture="environment">` oculto (força a câmera traseira no Android/Chrome sob
  HTTPS, com fallback para galeria). O upload ao bucket `ticket-proofs` é o mesmo
  nos dois caminhos.
- **Push após login**: `src/lib/auth.tsx` chama `registerPushOnLogin()` no evento
  `SIGNED_IN` do `onAuthStateChange`.

### 12.3 Offline-first
- **`src/lib/offline.ts`** — `setupOfflineSupport(queryClient)` (chamado no
  `__root.tsx`) persiste o cache das queries de leitura (`tickets`, `profiles`,
  `tecnicos`, `localidades`) no IndexedDB e mantém uma **fila de mutações**
  (`queueMutation`/`flushMutationQueue`) reprocessada no evento
  `window 'online'`. Handlers reais são registrados via `registerMutationHandler`.

### 12.4 Passo a passo para gerar o APK
```bash
bun install
bun add -d @capacitor/cli @capacitor/android
bun run build:mobile        # gera os estáticos em dist/ (webDir)
npx cap add android         # apenas na 1ª vez
npx cap sync android        # copia web + plugins nativos
npx cap open android        # abre no Android Studio → Build > Generate APK
```
- **Push (FCM):** adicione o `google-services.json` do Firebase em
  `android/app/` e habilite o Cloud Messaging. Os tokens capturados ficam em
  `device_tokens`; o envio das notificações é feito por um serviço externo/backend
  que lê essa tabela (service role).
- **Permissões:** Câmera e Notificações são solicitadas em runtime pelos plugins.

> Web e APK compartilham 100% do mesmo código; a diferença é resolvida em runtime
> por `Capacitor.isNativePlatform()`. Nenhuma funcionalidade web é perdida no APK.
