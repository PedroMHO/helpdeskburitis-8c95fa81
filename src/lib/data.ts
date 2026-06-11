import { supabase } from "@/integrations/supabase/client";
import type { TicketPriority, TicketStatus } from "@/lib/helpdesk";

export interface TicketRow {
  id: string;
  titulo: string;
  descricao: string;
  status: TicketStatus;
  priority: TicketPriority;
  solicitante_id: string;
  solicitante_nome: string | null;
  solicitante_ref: string | null;
  tecnico_id: string | null;
  created_by: string;
  cidade_id: string | null;
  bairro_id: string | null;
  setor_id: string | null;
  closing_note: string | null;
  closing_image_url: string | null;
  closed_at: string | null;
  closed_by: string | null;
  scheduled_at: string | null;
  created_at: string;
}

export interface ProfileLite {
  id: string;
  full_name: string;
  email: string;
}

export async function fetchTickets(): Promise<TicketRow[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TicketRow[];
}

export async function fetchTicket(id: string): Promise<TicketRow | null> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as TicketRow) ?? null;
}

export async function fetchProfiles(): Promise<ProfileLite[]> {
  // Uses a safe directory function that returns names without exposing emails,
  // so every authenticated user can resolve names for tickets they can see.
  const { data, error } = await supabase.rpc("profiles_directory");
  if (error) throw error;
  return ((data ?? []) as ProfileLite[]).sort((a, b) =>
    (a.full_name || "").localeCompare(b.full_name || ""),
  );
}

/** Technicians + admins, for assignment dropdowns. */
export async function fetchTecnicos(): Promise<ProfileLite[]> {
  const { data: roleRows, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["tecnico", "admin"]);
  if (error) throw error;
  const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids)
    .order("full_name");
  return (data ?? []) as ProfileLite[];
}

export interface Cidade {
  id: string;
  nome: string;
}
export interface Bairro {
  id: string;
  nome: string;
  cidade_id: string;
}
export interface Setor {
  id: string;
  nome: string;
  bairro_id: string;
}

export async function fetchLocalidades() {
  const [cidades, bairros, setores] = await Promise.all([
    supabase.from("cidades").select("*").order("nome"),
    supabase.from("bairros").select("*").order("nome"),
    supabase.from("setores").select("*").order("nome"),
  ]);
  return {
    cidades: (cidades.data ?? []) as Cidade[],
    bairros: (bairros.data ?? []) as Bairro[],
    setores: (setores.data ?? []) as Setor[],
  };
}

export interface Solicitante {
  id: string;
  nome: string;
  setor_id: string | null;
}

export async function fetchSolicitantes(): Promise<Solicitante[]> {
  const { data, error } = await supabase
    .from("solicitantes")
    .select("id, nome, setor_id")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as Solicitante[];
}

export interface TechnicianStatusRow {
  user_id: string;
  status: string;
  setor_id: string | null;
  updated_at: string;
}

export async function fetchTechnicianStatuses(): Promise<TechnicianStatusRow[]> {
  const { data, error } = await supabase
    .from("technician_status")
    .select("user_id, status, setor_id, updated_at");
  if (error) throw error;
  return (data ?? []) as TechnicianStatusRow[];
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ticket_id: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, ticket_id, read, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

/** Upsert the current technician's live status. */
export async function setTechnicianStatus(
  userId: string,
  status: string,
  setorId: string | null,
) {
  await supabase
    .from("technician_status")
    .upsert(
      { user_id: userId, status, setor_id: setorId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}
