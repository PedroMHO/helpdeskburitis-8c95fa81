import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calendar,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useMobileFeatures } from "@/hooks/useMobileFeatures";
import { fetchTicketSolicitacoes, type SolicitacaoRow } from "@/lib/data";
import { asDbStatus, signedUrl, type TicketStatus } from "@/lib/helpdesk";
import { PriorityBadge } from "@/components/TicketBadges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


/** Situação de cada solicitação extra (espelha o fluxo do chamado). */
const SOLIC_STATUS_LABEL: Record<string, string> = {
  aberta: "Em aberto",
  em_atendimento: "Em Atendimento",
  em_reparo: "Em Manutenção (Reparo)",
  pronto_entrega: "Pronto para Entregar",
  agendada: "Agendada",
  aguardando_verificacao: "Aguardando Verificação",
  pendente_aprovacao: "Pendente de Aprovação",
  finalizada: "Finalizada",
};

/** Situações que o administrador pode aplicar manualmente. */
const ADMIN_STATUS_OPTIONS = [
  "aberta",
  "em_atendimento",
  "em_reparo",
  "agendada",
  "pronto_entrega",
  "aguardando_verificacao",
  "finalizada",
];


/**
 * Cards das solicitações extras anexadas ao chamado. Cada card pode ser
 * finalizado individualmente (uma baixa por vez), sem encerrar o chamado, e
 * possui as mesmas ações de fluxo do card principal — respeitando as mesmas
 * permissões de cargo.
 */
export function SolicitacaoCards({
  ticketId,
  ticketStatus,
  canFinalize,
  context = "detalhe",
}: {
  ticketId: string;
  ticketStatus: TicketStatus;
  canFinalize: boolean;
  context?: "detalhe" | "manutencao";
}) {
  const { user, isAdmin, isTecnico, isAtendente } = useAuth();
  const qc = useQueryClient();
  const { takeNativePhoto } = useMobileFeatures();
  const { data: solicitacoes = [] } = useQuery({
    queryKey: ["ticket-solicitacoes", ticketId],
    queryFn: () => fetchTicketSolicitacoes(ticketId),
  });

  // Mesmas regras de permissão aplicadas no card principal do chamado.
  const showStatusButtons = isTecnico || isAtendente;
  const canSchedule = isAdmin || isTecnico || isAtendente;
  const canVerify = isAdmin || isTecnico || isAtendente;
  const canManage = isAdmin || isTecnico;
  const canFinalizarRapido = isAdmin || isAtendente;
  const canApprove = isAdmin;
  const canDelete = isAdmin;


  const [target, setTarget] = useState<SolicitacaoRow | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<SolicitacaoRow | null>(
    null,
  );
  const [scheduleAt, setScheduleAt] = useState("");
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  const handleCamera = async () => {
    const shot = await takeNativePhoto();
    if (!shot) return cameraRef.current?.click();
    setFile(
      new File([shot.blob], shot.fileName, {
        type: shot.blob.type || "image/jpeg",
      }),
    );
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ticket-solicitacoes", ticketId] });
    qc.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["solicitacoes-resumo"] });
  };

  /** Altera a situação de uma solicitação e registra no histórico. */
  const mudarStatus = async (
    s: SolicitacaoRow,
    status: string,
    extra?: { scheduled_at?: string | null },
  ) => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("ticket_solicitacoes")
      .update({ status, ...(extra ?? {}) })
      .eq("id", s.id)
      .neq("status", "finalizada");
    if (!error) {
      await supabase.from("ticket_history").insert({
        ticket_id: ticketId,
        from_status: asDbStatus(ticketStatus),
        to_status: asDbStatus(ticketStatus),
        changed_by: user.id,
        note: `Solicitação "${s.descricao}" → ${SOLIC_STATUS_LABEL[status] ?? status}${
          extra?.scheduled_at
            ? ` para ${new Date(extra.scheduled_at).toLocaleString("pt-BR")}`
            : ""
        }`,
      });
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success(`Solicitação atualizada: ${SOLIC_STATUS_LABEL[status] ?? status}`);
    refresh();
  };

  const agendar = async () => {
    if (!scheduleTarget) return;
    if (!scheduleAt) return toast.error("Escolha a data e a hora do agendamento.");
    await mudarStatus(scheduleTarget, "agendada", {
      scheduled_at: new Date(scheduleAt).toISOString(),
    });
    setScheduleTarget(null);
    setScheduleAt("");
  };

  const finalizar = async () => {
    if (!user || !target) return;
    if (!note.trim()) return toast.error("Descreva a solução da solicitação.");
    setBusy(true);
    let path: string | null = null;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      path = `${ticketId}/solicitacoes/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("ticket-proofs")
        .upload(path, file);
      if (upErr) {
        setBusy(false);
        return toast.error("Erro no upload", { description: upErr.message });
      }
    }
    const { error } = await supabase
      .from("ticket_solicitacoes")
      .update({
        status: "finalizada",
        closing_note: note.trim(),
        closing_image_url: path,
        closed_at: new Date().toISOString(),
        closed_by: user.id,
      })
      .eq("id", target.id)
      .neq("status", "finalizada");
    if (!error) {
      await supabase.from("ticket_history").insert({
        ticket_id: ticketId,
        from_status: asDbStatus(ticketStatus),
        to_status: asDbStatus(ticketStatus),
        changed_by: user.id,
        note: `Solicitação finalizada: ${target.descricao} — Solução: ${note.trim()}`,
      });
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Solicitação finalizada!");
    setTarget(null);
    setNote("");
    setFile(null);
    refresh();
  };

  /** Baixa rápida (admin/atendente): finaliza sem exigir foto/solução detalhada. */
  const finalizarRapido = async (s: SolicitacaoRow) => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("ticket_solicitacoes")
      .update({
        status: "finalizada",
        closing_note: "Solicitação finalizada administrativamente.",
        closed_at: new Date().toISOString(),
        closed_by: user.id,
      })
      .eq("id", s.id)
      .neq("status", "finalizada");
    if (!error) {
      await supabase.from("ticket_history").insert({
        ticket_id: ticketId,
        from_status: asDbStatus(ticketStatus),
        to_status: asDbStatus(ticketStatus),
        changed_by: user.id,
        note: `Solicitação finalizada administrativamente: ${s.descricao}`,
      });
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Solicitação finalizada!");
    refresh();
  };

  /** Exclusão de solicitação (somente administrador). */
  const excluir = async (s: SolicitacaoRow) => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("ticket_solicitacoes")
      .delete()
      .eq("id", s.id);
    if (!error) {
      await supabase.from("ticket_history").insert({
        ticket_id: ticketId,
        from_status: asDbStatus(ticketStatus),
        to_status: asDbStatus(ticketStatus),
        changed_by: user.id,
        note: `Solicitação excluída pelo administrador: ${s.descricao}`,
      });
    }
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Solicitação excluída.");
    refresh();
  };

  if (solicitacoes.length === 0) return null;

  return (
    <>
      {solicitacoes.map((s, i) => (
        <SolicitacaoCard
          key={s.id}
          solicitacao={s}
          index={i + 2}
          context={context}
          ticketStatus={ticketStatus}
          canFinalize={canFinalize}
          showStatusButtons={showStatusButtons}
          canSchedule={canSchedule}
          canVerify={canVerify}
          isAdmin={isAdmin}
          canManage={canManage}
          canFinalizarRapido={canFinalizarRapido}
          canApprove={canApprove}
          canDelete={canDelete}
          busy={busy}
          onFinalize={() => {
            setTarget(s);
            setNote("");
            setFile(null);
          }}
          onReparo={() => mudarStatus(s, "em_reparo")}
          onPronto={() => mudarStatus(s, "pronto_entrega")}
          onVerificar={() => mudarStatus(s, "aguardando_verificacao")}
          onIniciar={() => mudarStatus(s, "em_atendimento")}
          onStatusChange={(v) => mudarStatus(s, v)}
          onFinalizarRapido={() => finalizarRapido(s)}
          onAprovar={() => finalizarRapido(s)}
          onRecusar={() => mudarStatus(s, "aberta")}
          onExcluir={() => excluir(s)}
          onAgendar={() => {
            setScheduleTarget(s);
            setScheduleAt("");
          }}
        />
      ))}


      <Dialog
        open={!!scheduleTarget}
        onOpenChange={(v) => !v && setScheduleTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar solicitação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="rounded-md bg-muted/50 p-3 text-sm text-foreground/90">
              {scheduleTarget?.descricao}
            </p>
            <div className="space-y-2">
              <Label htmlFor="solic-sched">Data e hora *</Label>
              <Input
                id="solic-sched"
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={agendar} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar baixa na solicitação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="rounded-md bg-muted/50 p-3 text-sm text-foreground/90">
              {target?.descricao}
            </p>
            <div className="space-y-2">
              <Label htmlFor="solic-note">Solução aplicada *</Label>
              <Textarea
                id="solic-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Descreva como esta solicitação foi resolvida..."
              />
            </div>
            <div className="space-y-2">
              <Label>Imagem de comprovação (opcional)</Label>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleCamera}
              >
                <Camera className="h-4 w-4" />
                {file ? "Trocar foto" : "Tirar Foto"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => galleryRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" /> Importar da galeria
              </Button>
              {file && (
                <p className="truncate text-xs text-muted-foreground">
                  Selecionado: {file.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={finalizar} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SolicitacaoCard({
  solicitacao: s,
  index,
  ticketStatus,
  canFinalize,
  showStatusButtons,
  canSchedule,
  canVerify,
  isAdmin,
  canManage,
  canFinalizarRapido,
  canApprove,
  canDelete,
  busy,
  onFinalize,
  onReparo,
  onPronto,
  onVerificar,
  onIniciar,
  onStatusChange,
  onFinalizarRapido,
  onAprovar,
  onRecusar,
  onExcluir,
  onAgendar,
}: {
  solicitacao: SolicitacaoRow;
  index: number;
  ticketStatus: TicketStatus;
  canFinalize: boolean;
  showStatusButtons: boolean;
  canSchedule: boolean;
  canVerify: boolean;
  isAdmin: boolean;
  canManage: boolean;
  canFinalizarRapido: boolean;
  canApprove: boolean;
  canDelete: boolean;
  busy: boolean;
  onFinalize: () => void;
  onReparo: () => void;
  onPronto: () => void;
  onVerificar: () => void;
  onIniciar: () => void;
  onStatusChange: (status: string) => void;
  onFinalizarRapido: () => void;
  onAprovar: () => void;
  onRecusar: () => void;
  onExcluir: () => void;
  onAgendar: () => void;
}) {

  const [img, setImg] = useState<string | null>(null);
  const done = s.status === "finalizada";

  useEffect(() => {
    if (s.closing_image_url)
      signedUrl("ticket-proofs", s.closing_image_url).then(setImg);
  }, [s.closing_image_url]);

  return (
    <div className="rounded-xl glass-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <MessageSquarePlus className="h-4 w-4 shrink-0" />
          Solicitação #{index}
        </h2>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={s.priority} />
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              done
                ? "bg-status-finalizado/10 text-status-finalizado"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {SOLIC_STATUS_LABEL[s.status] ?? s.status}
          </span>
        </div>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/90">
        {s.descricao}
      </p>

      <div className="mt-4 grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-2">
        {s.solicitante_nome && (
          <span className="flex min-w-0 items-center gap-1.5">
            <UserIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Solicitante: {s.solicitante_nome}</span>
          </span>
        )}
        <span>Adicionada em {new Date(s.created_at).toLocaleString("pt-BR")}</span>
        {s.scheduled_at && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            Agendada para {new Date(s.scheduled_at).toLocaleString("pt-BR")}
          </span>
        )}
      </div>

      {done && (
        <div className="mt-4 rounded-lg border border-status-finalizado/30 bg-status-finalizado/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-status-finalizado">
            <CheckCircle2 className="h-4 w-4" /> Solução aplicada
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
            {s.closing_note}
          </p>
          {s.closed_at && (
            <p className="mt-2 text-xs text-muted-foreground">
              {new Date(s.closed_at).toLocaleString("pt-BR")}
            </p>
          )}
          {img && (
            <img
              src={img}
              alt="Comprovação da solicitação"
              className="mt-3 max-h-60 rounded-lg border object-contain"
            />
          )}
        </div>
      )}

      {!done && (
        <div className="mt-4 space-y-4 border-t pt-3">
          {isAdmin && (
            <div className="space-y-1.5">
              <Label className="text-xs">Alterar situação da solicitação</Label>
              <Select
                value={s.status}
                onValueChange={onStatusChange}
                disabled={busy}
              >
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {SOLIC_STATUS_LABEL[opt] ?? opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canManage && s.status !== "em_atendimento" && (
              <Button
                size="sm"
                onClick={onIniciar}
                disabled={busy}
              >
                <Wrench className="h-4 w-4" /> Iniciar
              </Button>
            )}
            {showStatusButtons && s.status !== "em_reparo" && (
              <Button
                size="sm"
                variant="outline"
                onClick={onReparo}
                disabled={busy}
              >
                <Wrench className="h-4 w-4" /> (Reparo)
              </Button>
            )}
            {showStatusButtons && ticketStatus === "em_manutencao" && s.status !== "pronto_entrega" && (
              <Button
                size="sm"
                variant="outline"
                onClick={onPronto}
                disabled={busy}
              >
                <CheckCircle2 className="h-4 w-4" /> (Pronto para Entregar)
              </Button>
            )}
            {canSchedule && (
              <Button
                size="sm"
                variant="outline"
                onClick={onAgendar}
                disabled={busy}
              >
                <Calendar className="h-4 w-4" /> Agendar
              </Button>
            )}
            {canVerify && s.status !== "aguardando_verificacao" && (
              <Button
                size="sm"
                variant="outline"
                onClick={onVerificar}
                disabled={busy}
              >
                <ShieldAlert className="h-4 w-4" /> Transferir para verificação
              </Button>
            )}
            {canFinalize && (
              <Button size="sm" onClick={onFinalize} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" /> Dar Baixa nesta Solicitação
              </Button>
            )}
            {canFinalizarRapido && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onFinalizarRapido}
                disabled={busy}
              >
                <CheckCircle2 className="h-4 w-4" /> Finalizar Solicitação
              </Button>
            )}
            {canApprove && s.status === "pendente_aprovacao" && (
              <>
                <Button size="sm" onClick={onAprovar} disabled={busy}>
                  <ThumbsUp className="h-4 w-4" /> Aprovar Baixa
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onRecusar}
                  disabled={busy}
                >
                  <ThumbsDown className="h-4 w-4" /> Recusar Baixa
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={onExcluir}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
