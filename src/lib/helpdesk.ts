import { supabase } from "@/integrations/supabase/client";

export type TicketStatus = "aguardando" | "agendado" | "em_atendimento" | "finalizado";
export type TicketPriority = "baixa" | "media" | "alta";

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aguardando: "Aguardando",
  agendado: "Agendado",
  em_atendimento: "Em Atendimento",
  finalizado: "Finalizado",
};

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
