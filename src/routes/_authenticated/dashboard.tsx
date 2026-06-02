import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Ticket, Clock, Wrench, CheckCircle2, AlertTriangle } from "lucide-react";
import { fetchTickets, fetchLocalidades } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { PriorityBadge, StatusBadge } from "@/components/TicketBadges";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Painel — Chamados Informática Buritis" }],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg", accent)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { profile, isAdmin, isTecnico } = useAuth();
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchTickets,
  });
  const { data: localidades } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });
  const setorNome = (id: string | null) =>
    id ? localidades?.setores.find((s) => s.id === id)?.nome ?? null : null;

  const aguardando = tickets.filter((t) => t.status === "aguardando").length;
  const andamento = tickets.filter((t) => t.status === "em_atendimento").length;
  const finalizados = tickets.filter((t) => t.status === "finalizado").length;
  const alta = tickets.filter(
    (t) => t.priority === "alta" && t.status !== "finalizado",
  ).length;

  const recentes = tickets.filter((t) => t.status !== "finalizado").slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Olá, {profile?.full_name?.split(" ")[0] || "bem-vindo"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Visão geral de todos os chamados."
            : isTecnico
              ? "Chamados disponíveis e atribuídos a você."
              : "Acompanhe suas solicitações."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Aguardando" value={aguardando} icon={Clock} accent="bg-status-aguardando/15 text-status-aguardando" />
        <StatCard label="Em Atendimento" value={andamento} icon={Wrench} accent="bg-status-atendimento/15 text-status-atendimento" />
        <StatCard label="Finalizados" value={finalizados} icon={CheckCircle2} accent="bg-status-finalizado/15 text-status-finalizado" />
        <StatCard label="Prioridade Alta" value={alta} icon={AlertTriangle} accent="bg-priority-alta/15 text-priority-alta" />
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold text-foreground">Chamados recentes</h2>
          <Link to="/tickets" className="text-sm font-medium text-primary hover:underline">
            Ver todos
          </Link>
        </div>
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Carregando...</p>
        ) : recentes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Ticket className="h-8 w-8" />
            <p className="text-sm">Nenhum chamado ainda.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {recentes.map((t) => (
              <li key={t.id}>
                <Link
                  to="/tickets/$id"
                  params={{ id: t.id }}
                  className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{t.titulo}</p>
                    {setorNome(t.setor_id) && (
                      <p className="truncate text-xs font-medium text-primary">
                        {setorNome(t.setor_id)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
