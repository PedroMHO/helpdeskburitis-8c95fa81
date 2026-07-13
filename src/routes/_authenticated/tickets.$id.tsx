import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Wrench,
  CheckCircle2,
  MapPin,
  User as UserIcon,
  Calendar,
  Trash2,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  Camera,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchTicket, fetchProfiles, fetchLocalidades, fetchTecnicos, setTechnicianStatus } from "@/lib/data";
import { signedUrl } from "@/lib/helpdesk";
import { PriorityBadge, StatusBadge } from "@/components/TicketBadges";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABEL, asDbStatus, type TicketStatus } from "@/lib/helpdesk";

export const Route = createFileRoute("/_authenticated/tickets/$id")({
  head: () => ({ meta: [{ title: "Chamado — HelpDesk Buritis" }] }),
  component: TicketDetail,
});

function TicketDetail() {
  const { id } = Route.useParams();
  const { user, isAdmin, isTecnico, isAtendente, isSolicitante } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => fetchTicket(id),
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });
  const { data: tecnicos = [] } = useQuery({
    queryKey: ["tecnicos"],
    queryFn: fetchTecnicos,
  });

  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [quickFinalizing, setQuickFinalizing] = useState(false);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyNote, setVerifyNote] = useState("");


  useEffect(() => {
    if (ticket?.closing_image_url) {
      signedUrl("ticket-proofs", ticket.closing_image_url).then(setProofUrl);
    }
  }, [ticket?.closing_image_url]);

  if (isLoading)
    return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
  if (!ticket)
    return <p className="text-muted-foreground">Chamado não encontrado.</p>;

  const canManage = isAdmin || isTecnico;
  const canSchedule = canManage || isAtendente;
  const isOwner = !!user && ticket.solicitante_id === user.id;
  const canDelete = isAdmin || isOwner;
  // Técnicos agora podem transferir chamados como os administradores/atendentes.
  const canTransfer = isAdmin || isAtendente || isTecnico;
  // Admin, técnico e atendente podem enviar um chamado para verificação.
  const canVerify = isAdmin || isTecnico || isAtendente;
  const showStatusButtons = isTecnico || isAtendente;
  const canFinalizarRapido = isAdmin || isAtendente;
  const canApprove = isAdmin;


  const name = (uid: string | null) =>
    profiles.find((p) => p.id === uid)?.full_name || "—";
  const locName = () => {
    const parts = [
      loc?.setores.find((s) => s.id === ticket.setor_id)?.nome,
      loc?.bairros.find((b) => b.id === ticket.bairro_id)?.nome,
      loc?.cidades.find((c) => c.id === ticket.cidade_id)?.nome,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Não informada";
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["technician-status"] });
  };

  const recordHistory = async (
    from: TicketStatus,
    to: TicketStatus,
    historyNote?: string,
  ) => {
    if (!user) return;
    await supabase.from("ticket_history").insert({
      ticket_id: ticket.id,
      from_status: asDbStatus(from),
      to_status: asDbStatus(to),
      changed_by: user.id,
      note: historyNote ?? null,
    });
  };

  const assumir = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({ status: "em_atendimento", tecnico_id: user.id })
      .eq("id", ticket.id);
    if (!error) {
      await recordHistory(ticket.status, "em_atendimento");
      await setTechnicianStatus(user.id, "atendendo", ticket.setor_id);
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado iniciado!");
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["technician-status"] });
  };

  const syncTechStatus = async (novo: TicketStatus) => {
    if (!user || !(isAdmin || isTecnico)) return;
    // Em Manutenção libera o técnico (equipamento foi para o laboratório).
    if (novo === "em_atendimento") await setTechnicianStatus(user.id, "atendendo", ticket.setor_id);
    else await setTechnicianStatus(user.id, "disponivel", null);
  };

  const mudarStatus = async (novo: TicketStatus) => {
    if (!user || novo === ticket.status) return;
    if (novo === "finalizado") {
      setFinalizing(true);
      return;
    }
    setBusy(true);
    const patch: { status: TicketStatus; tecnico_id?: string } = { status: novo };
    if (novo === "em_atendimento" && !ticket.tecnico_id) patch.tecnico_id = user.id;
    const { error } = await supabase
      .from("tickets")
      .update({ ...patch, status: asDbStatus(novo) })
      .eq("id", ticket.id);
    if (!error) {
      await recordHistory(ticket.status, novo);
      await syncTechStatus(novo);
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success(`Status alterado para "${STATUS_LABEL[novo]}".`);
    invalidateAll();
  };

  // Ação: Transferir para verificação (admin, técnico, atendente).
  const transferirParaVerificacao = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({ status: asDbStatus("aguardando_verificacao") })
      .eq("id", ticket.id);
    if (!error) {
      await recordHistory(
        ticket.status,
        "aguardando_verificacao",
        verifyNote.trim() || undefined,
      );
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado transferido para verificação.");
    setVerifying(false);
    setVerifyNote("");
    invalidateAll();
  };

  const agendar = async () => {
    if (!user) return;
    if (!scheduleAt) return toast.error("Selecione a data e hora do agendamento.");
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({
        scheduled_at: new Date(scheduleAt).toISOString(),
        status: asDbStatus("agendado"),
      })
      .eq("id", ticket.id);
    if (!error && ticket.status !== "agendado")
      await recordHistory(ticket.status, "agendado");
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado agendado!");
    setScheduling(false);
    invalidateAll();
  };

  const finalizar = async () => {
    if (!user) return;
    if (!note.trim())
      return toast.error("A observação de fechamento é obrigatória.");
    if (!file) return toast.error("Anexe uma imagem de comprovação.");
    setBusy(true);

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${ticket.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("ticket-proofs")
      .upload(path, file);
    if (upErr) {
      setBusy(false);
      return toast.error("Erro no upload", { description: upErr.message });
    }

    // Prevenção de conflito/duplicidade: só finaliza se ainda não estiver
    // 'finalizado'. Se outro técnico já deu baixa, capturamos a 2ª tentativa
    // e enviamos para aprovação administrativa.
    const { data: updated, error } = await supabase
      .from("tickets")
      .update({
        status: asDbStatus("finalizado"),
        closing_note: note.trim(),
        closing_image_url: path,
        closed_at: new Date().toISOString(),
        closed_by: user.id,
        tecnico_id: ticket.tecnico_id ?? user.id,
      })
      .eq("id", ticket.id)
      .neq("status", asDbStatus("finalizado"))
      .select("id");
    if (!error && (!updated || updated.length === 0)) {
      await supabase
        .from("tickets")
        .update({ status: asDbStatus("pendente_aprovacao") })
        .eq("id", ticket.id);
      await recordHistory(
        "finalizado",
        "pendente_aprovacao",
        `[CONFLITO — 2ª tentativa de baixa] ${note.trim()} (imagem: ${path})`,
      );
      setBusy(false);
      setFinalizing(false);
      toast.warning("Conflito detectado", {
        description:
          "Este chamado já havia sido finalizado. Enviado para aprovação do administrador.",
      });
      invalidateAll();
      return;
    }
    if (!error) {
      await recordHistory(ticket.status, "finalizado", note.trim());
      if (ticket.tecnico_id) await setTechnicianStatus(ticket.tecnico_id, "disponivel", null);
      await setTechnicianStatus(user.id, "disponivel", null);
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado finalizado!");
    setFinalizing(false);
    invalidateAll();
  };

  const parcialmenteCompletar = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({
        status: asDbStatus("pendente_conclusao"),
        tecnico_id: ticket.tecnico_id ?? user.id,
      })
      .eq("id", ticket.id);
    if (!error) {
      await recordHistory(ticket.status, "pendente_conclusao", note.trim() || undefined);
      await setTechnicianStatus(user.id, "disponivel", null);
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado marcado como Pendente de Conclusão.");
    setFinalizing(false);
    invalidateAll();
  };

  const finalizarRapido = async () => {
    if (!user) return;
    if (!note.trim())
      return toast.error("A descrição/conclusão é obrigatória.");
    setBusy(true);
    // Mesma proteção de concorrência do fluxo de finalização com imagem.
    const { data: updated, error } = await supabase
      .from("tickets")
      .update({
        status: asDbStatus("finalizado"),
        closing_note: note.trim(),
        closed_at: new Date().toISOString(),
        closed_by: user.id,
        tecnico_id: ticket.tecnico_id ?? user.id,
      })
      .eq("id", ticket.id)
      .neq("status", asDbStatus("finalizado"))
      .select("id");
    if (!error && (!updated || updated.length === 0)) {
      await supabase
        .from("tickets")
        .update({ status: asDbStatus("pendente_aprovacao") })
        .eq("id", ticket.id);
      await recordHistory(
        "finalizado",
        "pendente_aprovacao",
        `[CONFLITO — 2ª tentativa de baixa] ${note.trim()}`,
      );
      setBusy(false);
      setQuickFinalizing(false);
      setNote("");
      toast.warning("Conflito detectado", {
        description:
          "Este chamado já havia sido finalizado. Enviado para aprovação do administrador.",
      });
      invalidateAll();
      return;
    }
    if (!error) {
      await recordHistory(ticket.status, "finalizado", note.trim());
      if (ticket.tecnico_id) await setTechnicianStatus(ticket.tecnico_id, "disponivel", null);
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado finalizado!");
    setQuickFinalizing(false);
    setNote("");
    invalidateAll();
  };

  // Aprovação/recusa administrativa de baixas em conflito (pendente_aprovacao).
  const aprovarBaixa = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({
        status: asDbStatus("finalizado"),
        closed_at: ticket.closed_at ?? new Date().toISOString(),
        closed_by: ticket.closed_by ?? user.id,
      })
      .eq("id", ticket.id);
    if (!error) {
      await recordHistory(ticket.status, "finalizado", "Baixa aprovada pelo administrador.");
      if (ticket.tecnico_id) await setTechnicianStatus(ticket.tecnico_id, "disponivel", null);
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Baixa aprovada — chamado finalizado.");
    invalidateAll();
  };

  const recusarBaixa = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({ status: asDbStatus("aguardando") })
      .eq("id", ticket.id);
    if (!error) {
      await recordHistory(ticket.status, "aguardando", "Baixa recusada — devolvido para a fila.");
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Baixa recusada — chamado devolvido para atendimento.");
    invalidateAll();
  };



  const excluir = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("tickets").delete().eq("id", ticket.id);
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado excluído!");
    qc.invalidateQueries({ queryKey: ["tickets"] });
    navigate({ to: "/tickets" });
  };

  const transferir = async () => {
    if (!user) return;
    if (!transferTo) return toast.error("Selecione um técnico.");
    if (transferTo === ticket.tecnico_id)
      return toast.error("O chamado já está atribuído a este técnico.");
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({ tecnico_id: transferTo })
      .eq("id", ticket.id);
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado transferido!");
    setTransferring(false);
    setTransferTo("");
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/tickets" })}>
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>

      <div className="rounded-xl glass-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground">{ticket.titulo}</h1>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/90">
          {ticket.descricao || "Sem descrição."}
        </p>

        <div className="mt-6 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserIcon className="h-4 w-4" /> Solicitante:{" "}
            <span className="text-foreground">{name(ticket.solicitante_id)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wrench className="h-4 w-4" /> Técnico:{" "}
            <span className="text-foreground">{name(ticket.tecnico_id)}</span>
          </div>
          {ticket.solicitante_nome && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <UserIcon className="h-4 w-4" /> Solicitante do Setor:{" "}
              <span className="text-foreground">{ticket.solicitante_nome}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" /> Localidade:{" "}
            <span className="text-foreground">{locName()}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" /> Aberto em:{" "}
            <span className="text-foreground">
              {new Date(ticket.created_at).toLocaleString("pt-BR")}
            </span>
          </div>
          {ticket.scheduled_at && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" /> Agendado para:{" "}
              <span className="font-medium text-foreground">
                {new Date(ticket.scheduled_at).toLocaleString("pt-BR")}
              </span>
            </div>
          )}
        </div>

        {ticket.status === "finalizado" && (
          <div className="mt-6 rounded-lg border border-status-finalizado/30 bg-status-finalizado/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-status-finalizado">
              <CheckCircle2 className="h-4 w-4" /> Solução aplicada
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
              {ticket.closing_note}
            </p>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <UserIcon className="h-3.5 w-3.5" /> Finalizado por:{" "}
              <span className="font-medium text-foreground">
                {name(ticket.closed_by ?? ticket.tecnico_id)}
              </span>
              {ticket.closed_at && (
                <span> · {new Date(ticket.closed_at).toLocaleString("pt-BR")}</span>
              )}
            </p>
            {proofUrl && (
              <img
                src={proofUrl}
                alt="Comprovação do atendimento"
                className="mt-3 max-h-72 rounded-lg border object-contain"
              />
            )}
          </div>
        )}

        {(canSchedule || (isOwner && ticket.status !== "finalizado") || canDelete) && (
          <div className="mt-6 space-y-4 border-t pt-4">
            {isAdmin && ticket.status !== "finalizado" && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Alterar status</Label>
                  <Select
                    value={ticket.status}
                    onValueChange={(v) => mudarStatus(v as TicketStatus)}
                    disabled={busy}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aguardando">
                        {STATUS_LABEL.aguardando}
                      </SelectItem>
                      <SelectItem value="aguardando_agendamento">
                        {STATUS_LABEL.aguardando_agendamento}
                      </SelectItem>
                      <SelectItem value="agendado">
                        {STATUS_LABEL.agendado}
                      </SelectItem>
                      <SelectItem value="em_atendimento">
                        {STATUS_LABEL.em_atendimento}
                      </SelectItem>
                      <SelectItem value="em_manutencao">
                        {STATUS_LABEL.em_manutencao}
                      </SelectItem>
                      <SelectItem value="pronto_entrega">
                        {STATUS_LABEL.pronto_entrega}
                      </SelectItem>
                      <SelectItem value="finalizado">
                        {STATUS_LABEL.finalizado}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {canManage &&
                (ticket.status === "aguardando" ||
                  ticket.status === "aguardando_agendamento" ||
                  ticket.status === "agendado") && (
                  <Button onClick={assumir} disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Wrench className="h-4 w-4" /> Iniciar
                  </Button>
                )}
              {showStatusButtons &&
                ticket.status !== "finalizado" &&
                ticket.status !== "em_manutencao" && (
                  <Button
                    variant="outline"
                    onClick={() => mudarStatus("em_manutencao")}
                    disabled={busy}
                  >
                    <Wrench className="h-4 w-4" /> (Reparo)
                  </Button>
                )}
              {showStatusButtons &&
                ticket.status !== "finalizado" &&
                ticket.status !== "pronto_entrega" && (
                  <Button
                    variant="outline"
                    onClick={() => mudarStatus("pronto_entrega")}
                    disabled={busy}
                  >
                    <CheckCircle2 className="h-4 w-4" /> (Pronto para Entregar)
                  </Button>
                )}
              {canSchedule && ticket.status !== "finalizado" && (
                <Button variant="outline" onClick={() => setScheduling(true)}>
                  <Calendar className="h-4 w-4" /> Agendar
                </Button>
              )}
              {!isSolicitante && ticket.status !== "finalizado" && (
                <Button onClick={() => setFinalizing(true)}>
                  <CheckCircle2 className="h-4 w-4" /> Dar Baixa
                </Button>
              )}
              {canFinalizarRapido && ticket.status !== "finalizado" && (
                <Button
                  variant="secondary"
                  onClick={() => setQuickFinalizing(true)}
                  disabled={busy}
                >
                  <CheckCircle2 className="h-4 w-4" /> Finalizar Chamado
                </Button>
              )}

              {canDelete && (
                <Button
                  variant="destructive"
                  onClick={() => setDeleting(true)}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              )}
              {canTransfer && ticket.status !== "finalizado" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setTransferTo(ticket.tecnico_id ?? "");
                    setTransferring(true);
                  }}
                >
                  <UserIcon className="h-4 w-4" /> Transferir
                </Button>
              )}
              {canVerify &&
                ticket.status !== "finalizado" &&
                ticket.status !== "aguardando_verificacao" &&
                ticket.status !== "pendente_aprovacao" && (
                  <Button
                    variant="outline"
                    onClick={() => setVerifying(true)}
                    disabled={busy}
                  >
                    <ShieldAlert className="h-4 w-4" /> Transferir para verificação
                  </Button>
                )}
              {canApprove && ticket.status === "pendente_aprovacao" && (
                <>
                  <Button onClick={aprovarBaixa} disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    <ThumbsUp className="h-4 w-4" /> Aprovar Baixa
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={recusarBaixa}
                    disabled={busy}
                  >
                    <ThumbsDown className="h-4 w-4" /> Recusar Baixa
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>


      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chamado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O chamado será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluir}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={transferring} onOpenChange={setTransferring}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Chamado</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Técnico responsável</Label>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um técnico" />
              </SelectTrigger>
              <SelectContent>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferring(false)}>
              Cancelar
            </Button>
            <Button onClick={transferir} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Transferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verifying} onOpenChange={setVerifying}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir para verificação</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="verify-note">Motivo / Observação (opcional)</Label>
            <Textarea
              id="verify-note"
              value={verifyNote}
              onChange={(e) => setVerifyNote(e.target.value)}
              rows={3}
              placeholder="Ex.: aguardando verificação de conectividade/servidor..."
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifying(false)}>
              Cancelar
            </Button>
            <Button onClick={transferirParaVerificacao} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <ShieldAlert className="h-4 w-4" /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={scheduling} onOpenChange={setScheduling}>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Chamado</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="schedule">Data e hora do atendimento</Label>
            <Input
              id="schedule"
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduling(false)}>
              Cancelar
            </Button>
            <Button onClick={agendar} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={finalizing} onOpenChange={setFinalizing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Chamado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="note">Observação de fechamento *</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Descreva a solução aplicada..."
                maxLength={2000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof">Imagem de comprovação *</Label>
              {/* accept + capture="environment" abrem a câmera traseira em
                  Android/Chrome; o usuário ainda pode escolher da galeria. */}
              <Input
                id="proof"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Toque para tirar uma foto com a câmera ou escolher da galeria.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setFinalizing(false)}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              onClick={parcialmenteCompletar}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Parcialmente Completado
            </Button>
            <Button onClick={finalizar} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Finalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickFinalizing} onOpenChange={setQuickFinalizing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Chamado</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="quick-note">Descrição / conclusão *</Label>
            <Textarea
              id="quick-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Descreva a conclusão do chamado..."
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">
              Não é necessário anexar imagem para finalizar por aqui.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickFinalizing(false)}>
              Cancelar
            </Button>
            <Button onClick={finalizarRapido} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Finalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
