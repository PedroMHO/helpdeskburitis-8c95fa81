import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Shield,
  Wrench,
  User as UserIcon,
  Loader2,
  UserPlus,
  Headset,
  Trash2,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import {
  createUserAccount,
  deleteUserAccount,
  updateUserRole,
} from "@/lib/admin-users.functions";
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

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Painel de Administração — HelpDesk Buritis" }] }),
  component: AdminPanel,
});

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
}

const ROLE_RANK: Record<AppRole, number> = {
  admin: 5,
  tecnico: 4,
  atendente: 3,
  usuario: 2,
  solicitante: 1,
};

const ROLE_META: Record<
  AppRole,
  { label: string; icon: typeof Shield; perms: string }
> = {
  admin: {
    label: "Administrador",
    icon: Shield,
    perms: "Acesso total: gerencia usuários, permissões e todos os chamados.",
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

function AdminPanel() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [isAdmin, loading, navigate]);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users-roles"],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const createUser = useServerFn(createUserAccount);
  const deleteUser = useServerFn(deleteUserAccount);
  const changeRoleFn = useServerFn(updateUserRole);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [novoRole, setNovoRole] = useState<AppRole>("usuario");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Lock className="h-6 w-6" />
        <p className="text-sm">Verificando permissões…</p>
      </div>
    );
  }

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
      qc.invalidateQueries({ queryKey: ["admin-users-roles"] });
    } catch (err) {
      toast.error("Erro ao criar usuário", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setCreating(false);
    }
  };

  const changeRole = async (userId: string, newRole: AppRole) => {
    try {
      await changeRoleFn({ data: { user_id: userId, role: newRole } });
      toast.success("Permissão atualizada.");
      qc.invalidateQueries({ queryKey: ["admin-users-roles"] });
    } catch (err) {
      toast.error("Erro", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    }
  };

  const handleDelete = async (userId: string) => {
    setDeletingId(userId);
    try {
      await deleteUser({ data: { user_id: userId } });
      toast.success("Usuário excluído com sucesso.");
      qc.invalidateQueries({ queryKey: ["admin-users-roles"] });
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Painel de Administração</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Gerenciamento isolado de usuários e níveis de acesso.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-xl glass-card p-4 shadow-sm sm:p-6"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Criar novo usuário</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome completo</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={6}
              maxLength={72}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="space-y-2">
            <Label>Cargo / Nível de acesso</Label>
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

      <section className="rounded-xl glass-card p-2 shadow-sm sm:p-4">
        <h2 className="px-2 pb-2 pt-1 text-sm font-semibold text-foreground">
          Usuários cadastrados ({users?.length ?? 0})
        </h2>
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
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
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
