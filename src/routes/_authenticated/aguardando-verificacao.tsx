import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Search } from "lucide-react";
import { fetchTickets, fetchLocalidades } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { PriorityBadge, StatusBadge } from "@/components/TicketBadges";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/aguardando-verificacao")({
  head: () => ({
    meta: [{ title: "Aguardando Verificação — HelpDesk Buritis" }],
  }),
  component: AguardandoVerificacao,
});

function AguardandoVerificacao() {
  const { isAdmin, isTecnico, isAtendente, loading } = useAuth();
  const navigate = useNavigate();
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchTickets,
  });
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin && !isTecnico && !isAtendente)
      navigate({ to: "/dashboard", replace: true });
  }, [loading, isAdmin, isTecnico, isAtendente, navigate]);

  const setorNome = (id: string | null) =>
    id ? loc?.setores.find((s) => s.id === id)?.nome ?? null : null;

  const filtered = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.status === "aguardando_verificacao" &&
          (!q || t.titulo.toLowerCase().includes(q.toLowerCase())),
      ),
    [tickets, q],
  );

  if (!isAdmin && !isTecnico && !isAtendente) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-atendimento/15 text-status-atendimento">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Aguardando Verificação</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} chamado(s) aguardando verificação
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl glass-card p-12 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8" />
          <p className="text-sm">Nenhum chamado aguardando verificação.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              to="/tickets/$id"
              params={{ id: t.id }}
              className="flex flex-col gap-3 rounded-xl glass-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight text-foreground">
                  {t.titulo}
                </h3>
                <PriorityBadge priority={t.priority} />
              </div>
              <p className="text-xs font-medium text-primary">
                Setor: {setorNome(t.setor_id) ?? "Não informado"}
              </p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {t.descricao || "Sem descrição."}
              </p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <StatusBadge status={t.status} />
                <span className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
