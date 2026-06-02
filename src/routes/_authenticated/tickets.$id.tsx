import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { fetchTicket, fetchProfiles, fetchLocalidades } from "@/lib/data";
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
import { STATUS_LABEL, type TicketStatus } from "@/lib/helpdesk";

export const Route = createFileRoute("/_authenticated/tickets/$id")({
  head: () => ({ meta: [{ title: "Chamado — Chamados Informática Buritis" }] }),
  component: TicketDetail,
});

function TicketDetail() {
  const { id } = Route.useParams();
  const { user, isAdmin, isTecnico } = useAuth();
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

  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

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
  const isOwner = !!user && ticket.solicitante_id === user.id;
  const canDelete = isAdmin || isOwner;
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

  const recordHistory = async (
    from: typeof ticket.status,
    to: typeof ticket.status,
    historyNote?: string,
  ) => {
    if (!user) return;
    await supabase.from("ticket_history").insert({
      ticket_id: ticket.id,
      from_status: from,
      to_status: to,
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
    if (!error) await recordHistory("aguardando", "em_atendimento");
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado assumido!");
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
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
      .update(patch)
      .eq("id", ticket.id);
    if (!error) await recordHistory(ticket.status, novo);
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success(`Status alterado para "${STATUS_LABEL[novo]}".`);
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const agendar = async () => {
    if (!user) return;
    if (!scheduleAt) return toast.error("Selecione a data e hora do agendamento.");
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({ scheduled_at: new Date(scheduleAt).toISOString() })
      .eq("id", ticket.id);
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado agendado!");
    setScheduling(false);
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
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

    const { error } = await supabase
      .from("tickets")
      .update({
        status: "finalizado",
        closing_note: note.trim(),
        closing_image_url: path,
        closed_at: new Date().toISOString(),
        tecnico_id: ticket.tecnico_id ?? user.id,
      })
      .eq("id", ticket.id);
    if (!error) await recordHistory(ticket.status, "finalizado", note.trim());
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado finalizado!");
    setFinalizing(false);
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/tickets" })}>
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
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
            {proofUrl && (
              <img
                src={proofUrl}
                alt="Comprovação do atendimento"
                className="mt-3 max-h-72 rounded-lg border object-contain"
              />
            )}
          </div>
        )}

        {(canManage || (isOwner && ticket.status !== "finalizado") || canDelete) && (
          <div className="mt-6 space-y-4 border-t pt-4">
            {canManage && ticket.status !== "finalizado" && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Alterar status</Label>
                  <Select
                    value={ticket.status}
                    onValueChange={(v) => mudarStatus(v as TicketStatus)}
                    disabled={busy}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aguardando">
                        {STATUS_LABEL.aguardando}
                      </SelectItem>
                      <SelectItem value="em_atendimento">
                        {STATUS_LABEL.em_atendimento}
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
              {canManage && ticket.status === "aguardando" && (
                <Button onClick={assumir} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Wrench className="h-4 w-4" /> Assumir Chamado
                </Button>
              )}
              {canManage && ticket.status !== "finalizado" && (
                <Button variant="outline" onClick={() => setScheduling(true)}>
                  <Calendar className="h-4 w-4" /> Agendar
                </Button>
              )}
              {ticket.status !== "finalizado" && (
                <Button onClick={() => setFinalizing(true)}>
                  <CheckCircle2 className="h-4 w-4" /> Dar Baixa
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
              <Input
                id="proof"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizing(false)}>
              Cancelar
            </Button>
            <Button onClick={finalizar} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Finalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
