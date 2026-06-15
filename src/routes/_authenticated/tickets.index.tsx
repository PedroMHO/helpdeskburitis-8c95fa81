import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ticket, PlusCircle, Search, Play } from "lucide-react";
import { fetchTickets, setTechnicianStatus } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PriorityBadge, StatusBadge } from "@/components/TicketBadges";
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/helpdesk";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/tickets/")({
  head: () => ({ meta: [{ title: "Chamados — HelpDesk Buritis" }] }),
  component: TicketsList,
});

function TicketsList() {
  const { isAdmin, isTecnico, isAtendente, user } = useAuth();
  const qc = useQueryClient();
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchTickets,
  });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [iniciandoId, setIniciandoId] = useState<string | null>(null);

  const canManage = isAdmin || isTecnico;

  const iniciar = async (
    e: React.MouseEvent,
    ticketId: string,
    setorId: string | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    setIniciandoId(ticketId);
    const { error } = await supabase
      .from("tickets")
      .update({ status: "em_atendimento", tecnico_id: user.id })
      .eq("id", ticketId);
    if (!error) {
      await supabase.from("ticket_history").insert({
        ticket_id: ticketId,
        from_status: "aguardando",
        to_status: "em_atendimento",
        changed_by: user.id,
      });
      await setTechnicianStatus(user.id, "atendendo", setorId);
    }
    setIniciandoId(null);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado iniciado!");
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["technician-status"] });
  };

  const onlyOwnQueue = isTecnico && !isAdmin && !isAtendente;

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        // Lista geral mostra chamados em aberto, em atendimento e prontos para entrega.
        // Agendados e Em Manutenção têm abas próprias.
        if (
          t.status !== "aguardando" &&
          t.status !== "em_atendimento" &&
          t.status !== "pronto_entrega"
        )
          return false;
        // Técnico: apenas não atribuídos + atribuídos a ele mesmo.
        // Admin e Atendente veem todos.
        if (onlyOwnQueue && t.tecnico_id && t.tecnico_id !== user?.id)
          return false;
        if (status !== "all" && t.status !== status) return false;
        if (priority !== "all" && t.priority !== priority) return false;
        if (q && !t.titulo.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [tickets, status, priority, q, onlyOwnQueue, user?.id],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chamados</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} chamado(s) listado(s)
          </p>
        </div>
        {!isAdmin && (
          <Button asChild>
            <Link to="/tickets/novo">
              <PlusCircle className="h-4 w-4" />
              Abrir Chamado
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título..."
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {(
              ["aguardando", "em_atendimento", "pronto_entrega"] as TicketStatus[]
            ).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl glass-card p-12 text-center text-muted-foreground">
          <Ticket className="h-8 w-8" />
          <p className="text-sm">Nenhum chamado encontrado.</p>
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
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {t.descricao || "Sem descrição."}
              </p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <StatusBadge status={t.status} />
                <span className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              {canManage && t.status === "aguardando" && (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={iniciandoId === t.id}
                  onClick={(e) => iniciar(e, t.id, t.setor_id)}
                >
                  <Play className="h-4 w-4" /> Iniciar
                </Button>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
