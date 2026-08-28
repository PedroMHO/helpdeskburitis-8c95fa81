import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Wrench, Search, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { fetchTickets, fetchLocalidades, fetchSolicitacoesResumo } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { asDbStatus } from "@/lib/helpdesk";
import { PriorityBadge, StatusBadge } from "@/components/TicketBadges";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SolicitacaoCards } from "@/components/SolicitacaoCards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/manutencao")({
  head: () => ({
    meta: [{ title: "Em Manutenção — HelpDesk Buritis" }],
  }),
  component: Manutencao,
});

function Manutencao() {
  const { user, isAdmin, isTecnico, isAtendente } = useAuth();
  const queryClient = useQueryClient();
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchTickets,
  });
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });
  const { data: solicitacoes = [] } = useQuery({
    queryKey: ["solicitacoes-resumo"],
    queryFn: fetchSolicitacoesResumo,
  });
  const [q, setQ] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  const solicitacoesEmReparo = useMemo(
    () => new Set(
      solicitacoes
        .filter((solicitacao) => solicitacao.status === "em_reparo")
        .map((solicitacao) => solicitacao.ticket_id),
    ),
    [solicitacoes],
  );

  const setorNome = (id: string | null) =>
    id ? loc?.setores.find((s) => s.id === id)?.nome ?? null : null;

  const filtered = useMemo(
    () =>
      tickets.filter(
        (t) =>
          (t.status === "em_manutencao" || solicitacoesEmReparo.has(t.id)) &&
          (!q || t.titulo.toLowerCase().includes(q.toLowerCase())),
      ),
    [tickets, q, solicitacoesEmReparo],
  );

  const marcarPrincipalComoPronto = async (ticketId: string) => {
    if (!user) return;
    setUpdatingTicketId(ticketId);
    const ticket = tickets.find((item) => item.id === ticketId);
    const { error } = await supabase
      .from("tickets")
      .update({ status: asDbStatus("pronto_entrega") })
      .eq("id", ticketId)
      .eq("status", asDbStatus("em_manutencao"));

    if (!error && ticket) {
      await supabase.from("ticket_history").insert({
        ticket_id: ticketId,
        from_status: asDbStatus("em_manutencao"),
        to_status: asDbStatus("pronto_entrega"),
        changed_by: user.id,
        note: "Chamado principal liberado pela página de manutenção.",
      });
    }
    setUpdatingTicketId(null);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado pronto para entrega.");
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
    queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
  };

  const canRelease = isAdmin || isTecnico || isAtendente;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-priority-alta/15 text-priority-alta">
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Em Manutenção</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} chamado(s) em manutenção
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
          <Wrench className="h-8 w-8" />
          <p className="text-sm">Nenhum chamado em manutenção.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-xl glass-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  to="/tickets/$id"
                  params={{ id: t.id }}
                  className="font-semibold leading-tight text-foreground hover:underline"
                >
                  {t.titulo}
                </Link>
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
              {canRelease && t.status === "em_manutencao" && (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={updatingTicketId === t.id}
                  onClick={() => marcarPrincipalComoPronto(t.id)}
                >
                  Pronto para Entregar
                </Button>
              )}
              <Dialog
                open={selectedTicketId === t.id}
                onOpenChange={(open) =>
                  setSelectedTicketId(open ? t.id : null)
                }
              >
                {solicitacoesEmReparo.has(t.id) && (
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                      Solicitações em manutenção
                    </Button>
                  </DialogTrigger>
                )}
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t.titulo}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <SolicitacaoCards
                      ticketId={t.id}
                      ticketStatus={t.status}
                      canFinalize={false}
                      context="manutencao"
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
