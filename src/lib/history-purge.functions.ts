import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const BUCKET = "ticket-proofs";

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data: isAdmin, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Apenas administradores podem executar esta ação.");
}

const rangeSchema = z.object({
  /** ISO date-time (inclusive) */
  from: z.string().min(4),
  /** ISO date-time (exclusive) */
  to: z.string().min(4),
});

/** Admin-only: how many finalized tickets fall in the range. */
export const countHistoryInRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("tickets")
      .select("id, closed_at, created_at")
      .eq("status", "finalizado");
    if (error) throw new Error(error.message);

    const from = new Date(data.from).getTime();
    const to = new Date(data.to).getTime();
    const count = (rows ?? []).filter((t) => {
      const ts = new Date((t.closed_at as string | null) ?? (t.created_at as string)).getTime();
      return ts >= from && ts < to;
    }).length;

    return { count };
  });

/** Admin-only: permanently deletes finalized tickets (and related data) in range. */
export const purgeHistoryInRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("tickets")
      .select("id, closed_at, created_at, closing_image_url")
      .eq("status", "finalizado");
    if (error) throw new Error(error.message);

    const from = new Date(data.from).getTime();
    const to = new Date(data.to).getTime();
    const target = (rows ?? []).filter((t) => {
      const ts = new Date((t.closed_at as string | null) ?? (t.created_at as string)).getTime();
      return ts >= from && ts < to;
    });
    if (target.length === 0) return { deleted: 0 };

    const ids = target.map((t) => t.id as string);

    // Remove closing images from private storage
    const paths = target
      .map((t) => t.closing_image_url as string | null)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await supabaseAdmin.storage.from(BUCKET).remove(paths);
    }

    // Related rows first (FK order)
    await supabaseAdmin.from("notifications").delete().in("ticket_id", ids);
    await supabaseAdmin.from("ticket_solicitacoes").delete().in("ticket_id", ids);
    await supabaseAdmin.from("ticket_history").delete().in("ticket_id", ids);

    const { error: delErr } = await supabaseAdmin.from("tickets").delete().in("id", ids);
    if (delErr) throw new Error(delErr.message);

    return { deleted: ids.length };
  });
