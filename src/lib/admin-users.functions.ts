import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createUserSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
  role: z.enum(["usuario", "tecnico", "admin", "atendente", "solicitante"]),
});

export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only admins may create users.
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Apenas administradores podem criar usuários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
    if (createErr) throw new Error(createErr.message);
    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("Falha ao criar o usuário.");

    // The signup trigger creates a default role; replace with the chosen one.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role });
    if (insErr) throw new Error(insErr.message);

    return { id: newUserId };
  });

const deleteUserSchema = z.object({
  user_id: z.string().uuid(),
});

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only admins may delete users.
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Apenas administradores podem excluir usuários.");
    if (data.user_id === userId)
      throw new Error("Você não pode excluir a sua própria conta.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(
      data.user_id,
    );
    if (delErr) throw new Error(delErr.message);

    return { id: data.user_id };
  });
