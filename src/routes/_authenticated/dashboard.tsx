import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Ticket, Clock, Wrench, CheckCircle2 } from "lucide-react";
import { fetchTickets, fetchLocalidades, fetchProfiles } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { PriorityBadge, StatusBadge } from "@/components/TicketBadges";
import { TechnicianStatusPanel } from "@/components/TechnicianStatusPanel";
import { DashboardCharts } from "@/components/DashboardCharts";
import { ActivityFeed } from "@/components/ActivityFeed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Painel — HelpDesk Buritis" }],
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
    <div className="glass-card rounded-2xl border p-4 shadow-sm sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">{value}</p>
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11", accent)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );

}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function BrasiliaClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const text = now.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm sm:px-4 sm:text-sm">
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{text} (Brasília)</span>
    </span>
  );

}

function Dashboard() {
  const { profile, user, isSolicitante, isTecnico, isAdmin } = useAuth();
  const { data: allTickets = [], isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchTickets,
  });
  const { data: localidades } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });
  const { data: solicResumo = [] } = useQuery({
    queryKey: ["solicitacoes-resumo"],
    queryFn: fetchSolicitacoesResumo,
  });


  // RBAC dashboard:
  // - solicitante só enxerga métricas dos próprios chamados.
  // - técnico (não-admin) não enxerga chamados já assumidos por OUTRO técnico.
  const tickets = useMemo(() => {
    if (isSolicitante) {
      return allTickets.filter(
        (t) => t.created_by === user?.id || t.solicitante_id === user?.id,
      );
    }
    if (isTecnico && !isAdmin) {
      return allTickets.filter(
        (t) => !t.tecnico_id || t.tecnico_id === user?.id,
      );
    }
    return allTickets;
  }, [allTickets, isSolicitante, isTecnico, isAdmin, user?.id]);


  const setorNome = (id: string | null) =>
    id ? localidades?.setores.find((s) => s.id === id)?.nome ?? null : null;
  const resolveName = (id: string | null) =>
    (id && profiles.find((p) => p.id === id)?.full_name) || "Técnico";

  const aguardando = tickets.filter((t) => t.status === "aguardando").length;
  const andamento = tickets.filter((t) => t.status === "em_atendimento").length;
  const manutencao = tickets.filter((t) => t.status === "em_manutencao").length;
  const finalizados = tickets.filter((t) => t.status === "finalizado").length;

  /**
   * Chamados com solicitações enviadas para reparo saem da tela inicial e só
   * retornam quando alguma delas for marcada como "Pronto para Entregar".
   */
  const emReparoIds = useMemo(() => {
    const reparo = new Set<string>();
    const liberado = new Set<string>();
    for (const s of solicResumo) {
      if (s.status === "em_reparo") reparo.add(s.ticket_id);
      else liberado.add(s.ticket_id);
    }
    return new Set([...reparo].filter((id) => !liberado.has(id)));
  }, [solicResumo]);

  const recentes = tickets
    .filter(
      (t) =>
        (t.status === "aguardando" || t.status === "em_atendimento") &&
        !emReparoIds.has(t.id),
    )
    .slice(0, 6);


  // Feed de atividades: conclusões mais recentes.
  const feed = useMemo(
    () =>
      tickets
        .filter((t) => t.status === "finalizado" && t.closed_at)
        .sort(
          (a, b) =>
            new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime(),
        )
        .slice(0, 30),
    [tickets],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">
            {greeting(new Date())}, {profile?.full_name?.split(" ")[0] || "bem-vindo"}
          </h1>
          <p className="text-sm text-muted-foreground">Visão Geral Do Sistema</p>
        </div>
        <BrasiliaClock />
      </div>

      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", isSolicitante ? "lg:grid-cols-2" : "lg:grid-cols-4")}>

        <StatCard label="Aberto" value={aguardando} icon={Clock} accent="bg-status-aguardando/15 text-status-aguardando" />
        {!isSolicitante && (
          <StatCard label="Em Atendimento" value={andamento} icon={Wrench} accent="bg-status-atendimento/15 text-status-atendimento" />
        )}
        <StatCard label="Finalizados" value={finalizados} icon={CheckCircle2} accent="bg-status-finalizado/15 text-status-finalizado" />
        {!isSolicitante && (
          <StatCard label="Em Manutenção" value={manutencao} icon={Wrench} accent="bg-priority-alta/15 text-priority-alta" />
        )}
      </div>


      {!isSolicitante && <TechnicianStatusPanel />}

      <DashboardCharts
        tickets={tickets}
        resolveName={resolveName}
        showCompletionCharts={!isSolicitante}
        feedSlot={
          isSolicitante ? null : <ActivityFeed feed={feed} profiles={profiles} />
        }
      />


      <div className="glass-card rounded-2xl border shadow-sm">
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
                  className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{t.titulo}</p>
                    <p className="truncate text-xs font-medium text-primary">
                      Setor: {setorNome(t.setor_id) ?? "Não informado"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
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
