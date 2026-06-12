import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Shield, Wrench, User as UserIcon, Loader2, UserPlus, Headset, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { createUserAccount, deleteUserAccount } from "@/lib/admin-users.functions";
import { fetchLocalidades } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — HelpDesk Buritis" }] }),
  component: Usuarios,
});

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  setor_id: string | null;
}

const ROLE_RANK: Record<AppRole, number> = {
  admin: 5,
  tecnico: 4,
  atendente: 3,
  usuario: 2,
  solicitante: 1,
};

async function fetchUsers(): Promise<UserRow[]> {
  const [{ data: profiles, error: pErr }, { data: roleRows, error: rErr }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, email, setor_id").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;

  const roleByUser = new Map<string, AppRole>();
  for (const r of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
    const cur = roleByUser.get(r.user_id);
    if (!cur || ROLE_RANK[r.role] > ROLE_RANK[cur]) roleByUser.set(r.user_id, r.role);
  }

  return ((profiles ?? []) as { id: string; full_name: string; email: string; setor_id: string | null }[]).map(
    (p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      setor_id: p.setor_id ?? null,
      role: roleByUser.get(p.id) ?? "usuario",
    }),
  );
}

const ROLE_META: Record<
  AppRole,
  { label: string; icon: typeof Shield; perms: string }
> = {
  admin: {
    label: "Administrador",
    icon: Shield,
    perms: "Acesso total: gerencia usuários, permissões, configurações e todos os chamados.",
  },
  tecnico: {
    label: "Técnico",
    icon: Wrench,
    perms: "Atende e finaliza chamados, visualiza todos os chamados.",
  },
  atendente: {
    label: "Atendente",
    icon: Headset,
    perms: "Lança e agenda chamados em nome dos usuários.",
  },
  usuario: {
    label: "Usuário Comum",
    icon: UserIcon,
    perms: "Abre os próprios chamados e acompanha o atendimento.",
  },
  solicitante: {
    label: "Solicitante",
    icon: UserIcon,
    perms: "Abre chamados simplificados, limitado a 1 a cada 30 minutos.",
  },
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
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
    enabled: isAdmin,
  });


  const createUser = useServerFn(createUserAccount);
  const deleteUser = useServerFn(deleteUserAccount);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [novoRole, setNovoRole] = useState<AppRole>("usuario");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || senha.length < 6) {
      return toast.error("Preencha nome, e-mail e senha (mín. 6 caracteres).");
    }
    setCreating(true);
    try {
      await createUser({
        data: {
          full_name: nome.trim(),
          email: email.trim(),
          password: senha,
          role: novoRole,
        },
      });
      toast.success("Usuário criado com sucesso!");
      setNome("");
      setEmail("");
      setSenha("");
      setNovoRole("usuario");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
    } catch (err) {
      toast.error("Erro ao criar usuário", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setCreating(false);
    }
  };

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

  const handleDelete = async (userId: string) => {
    setDeletingId(userId);
    try {
      await deleteUser({ data: { user_id: userId } });
      toast.success("Usuário excluído com sucesso.");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
    } catch (err) {
      toast.error("Erro ao excluir usuário", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Promova usuários a Técnico ou Administrador.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Criar novo usuário</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome completo</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} maxLength={72} placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="space-y-2">
            <Label>Permissão</Label>
            <Select value={novoRole} onValueChange={(v) => setNovoRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solicitante">Solicitante</SelectItem>
                <SelectItem value="usuario">Usuário Comum</SelectItem>
                <SelectItem value="atendente">Atendente</SelectItem>
                <SelectItem value="tecnico">Técnico</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_META[novoRole].perms}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar Usuário
          </Button>
        </div>
      </form>


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
                    <p className="mt-0.5 text-xs text-muted-foreground/80">{Meta.perms}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={u.role}
                      onValueChange={(v) => changeRole(u.id, v as AppRole)}
                      disabled={isSelf}
                    >
                      <SelectTrigger className="w-full sm:w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solicitante">Solicitante</SelectItem>
                        <SelectItem value="usuario">Usuário Comum</SelectItem>
                        <SelectItem value="atendente">Atendente</SelectItem>
                        <SelectItem value="tecnico">Técnico</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={isSelf || deletingId === u.id}
                          title="Excluir usuário"
                        >
                          {deletingId === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A conta de{" "}
                            <strong>{u.full_name || u.email}</strong> será removida
                            permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(u.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
