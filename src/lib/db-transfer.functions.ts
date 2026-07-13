import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { TicketPriority, TicketStatus } from "@/lib/helpdesk";

const BUCKET = "ticket-proofs";

async function assertAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data: isAdmin, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Apenas administradores podem executar esta ação.");
}

export interface ExportedTicket {
  id: string;
  titulo: string;
  descricao: string;
  status: string;
  priority: string;
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
  image_signed_url: string | null;
  history: {
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: string;
  }[];
}

/**
 * Admin-only. Returns every finalized ticket with its full history and a
 * short-lived signed URL for the closing image, so the browser can bundle
 * everything into a ZIP archive.
 */
export const exportTicketsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExportedTicket[]> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tickets, error: tErr } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("status", "finalizado")
      .order("created_at", { ascending: false });
    if (tErr) throw new Error(tErr.message);

    const { data: history, error: hErr } = await supabaseAdmin
      .from("ticket_history")
      .select("ticket_id, from_status, to_status, note, created_at");
    if (hErr) throw new Error(hErr.message);

    const historyByTicket = new Map<string, ExportedTicket["history"]>();
    for (const h of history ?? []) {
      const arr = historyByTicket.get(h.ticket_id as string) ?? [];
      arr.push({
        from_status: h.from_status as string | null,
        to_status: h.to_status as string,
        note: h.note as string | null,
        created_at: h.created_at as string,
      });
      historyByTicket.set(h.ticket_id as string, arr);
    }

    const result: ExportedTicket[] = [];
    for (const t of tickets ?? []) {
      let signed: string | null = null;
      if (t.closing_image_url) {
        const { data } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(t.closing_image_url as string, 60 * 30);
        signed = data?.signedUrl ?? null;
      }
      result.push({
        ...(t as unknown as Omit<ExportedTicket, "image_signed_url" | "history">),
        image_signed_url: signed,
        history: historyByTicket.get(t.id as string) ?? [],
      });
    }
    return result;
  });

const importSchema = z.object({
  ticket: z.object({
    titulo: z.string(),
    descricao: z.string(),
    status: z.string(),
    priority: z.string(),
    solicitante_nome: z.string().nullable().optional(),
    closing_note: z.string().nullable().optional(),
    closed_at: z.string().nullable().optional(),
    scheduled_at: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    history: z
      .array(
        z.object({
          from_status: z.string().nullable().optional(),
          to_status: z.string(),
          note: z.string().nullable().optional(),
          created_at: z.string().nullable().optional(),
        }),
      )
      .optional(),
  }),
  image_base64: z.string().nullable().optional(),
  image_name: z.string().nullable().optional(),
});

/**
 * Admin-only. Recreates a single ticket (description, resolution note and
 * closing photo) in this database. All people references default to the
 * importing admin, so it works across different Supabase projects.
 */
export const importTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => importSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ticket, image_base64, image_name } = data;

    const newId = crypto.randomUUID();

    // Upload the closing image (if any) under the new ticket id.
    let closingImageUrl: string | null = null;
    if (image_base64) {
      const ext = (image_name?.split(".").pop() || "jpg").toLowerCase();
      const path = `${newId}/${Date.now()}.${ext}`;
      const binary = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0));
      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, binary, {
          contentType: ext === "png" ? "image/png" : "image/jpeg",
          upsert: true,
        });
      if (upErr) throw new Error(`Falha ao enviar imagem: ${upErr.message}`);
      closingImageUrl = path;
    }

    const { error: insErr } = await supabaseAdmin.from("tickets").insert({
      id: newId,
      titulo: ticket.titulo,
      descricao: ticket.descricao,
      status: asDbStatus(ticket.status as TicketStatus),
      priority: ticket.priority as TicketPriority,
      solicitante_id: userId,
      solicitante_nome: ticket.solicitante_nome ?? null,
      created_by: userId,
      closing_note: ticket.closing_note ?? null,
      closing_image_url: closingImageUrl,
      closed_at: ticket.closed_at ?? null,
      closed_by: ticket.status === "finalizado" ? userId : null,
      scheduled_at: ticket.scheduled_at ?? null,
      created_at: ticket.created_at ?? new Date().toISOString(),
    });
    if (insErr) throw new Error(insErr.message);

    if (ticket.history?.length) {
      const rows = ticket.history.map((h) => ({
        ticket_id: newId,
        from_status: (h.from_status ?? null) as TicketStatus | null,
        to_status: h.to_status as TicketStatus,
        changed_by: userId,
        note: h.note ?? null,
        created_at: h.created_at ?? new Date().toISOString(),
      }));
      await supabaseAdmin.from("ticket_history").insert(rows);
    }

    return { id: newId };
  });
