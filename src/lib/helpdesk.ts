import { supabase } from "@/integrations/supabase/client";

export type TicketStatus =
  | "aguardando"
  | "aguardando_agendamento"
  | "agendado"
  | "em_atendimento"
  | "em_manutencao"
  | "pronto_entrega"
  | "finalizado";
export type TicketPriority = "baixa" | "media" | "alta";

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aguardando: "Aguardando",
  aguardando_agendamento: "Aguardando Agendamento",
  agendado: "Agendado",
  em_atendimento: "Em Atendimento",
  em_manutencao: "Em Manutenção",
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
