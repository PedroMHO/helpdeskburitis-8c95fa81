import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { Shield, Wrench, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Chamados Informática Buritis" }] }),
  component: Usuarios,
});

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
}

const ROLE_RANK: Record<AppRole, number> = { admin: 3, tecnico: 2, usuario: 1 };

async function fetchUsers(): Promise<UserRow[]> {
  const [{ data: profiles, error: pErr }, { data: roleRows, error: rErr }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;

  const roleByUser = new Map<string, AppRole>();
  for (const r of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
    const cur = roleByUser.get(r.user_id);
    if (!cur || ROLE_RANK[r.role] > ROLE_RANK[cur]) roleByUser.set(r.user_id, r.role);
  }

  return ((profiles ?? []) as { id: string; full_name: string; email: string }[]).map(
    (p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: roleByUser.get(p.id) ?? "usuario",
    }),
  );
}

const ROLE_META: Record<AppRole, { label: string; icon: typeof Shield }> = {
  admin: { label: "Administrador", icon: Shield },
  tecnico: { label: "Técnico", icon: Wrench },
  usuario: { label: "Usuário Comum", icon: UserIcon },
};

function Usuarios() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [isAdmin, loading, navigate]);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users-roles"],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const changeRole = async (userId: string, newRole: AppRole) => {
    // Replace all roles with the single selected role.
    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (delErr) return toast.error("Erro", { description: delErr.message });

    const { error: insErr } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: newRole });
    if (insErr) return toast.error("Erro", { description: insErr.message });

    toast.success("Permissão atualizada.");
    qc.invalidateQueries({ queryKey: ["users-roles"] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Promova usuários a Técnico ou Administrador.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-2 shadow-sm sm:p-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="divide-y">
            {(users ?? []).map((u) => {
              const Meta = ROLE_META[u.role];
              const isSelf = u.id === user?.id;
              return (
                <li
                  key={u.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {u.full_name || "Sem nome"}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Meta.icon className="h-3 w-3" />
                      {Meta.label}
                    </span>
                  </div>
                  <Select
                    value={u.role}
                    onValueChange={(v) => changeRole(u.id, v as AppRole)}
                    disabled={isSelf}
                  >
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usuario">Usuário Comum</SelectItem>
                      <SelectItem value="tecnico">Técnico</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
