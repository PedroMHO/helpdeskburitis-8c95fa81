import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useMobileFeatures } from "@/hooks/useMobileFeatures";
import { fetchTicketSolicitacoes, type SolicitacaoRow } from "@/lib/data";
import { asDbStatus, signedUrl, type TicketStatus } from "@/lib/helpdesk";
import { PriorityBadge } from "@/components/TicketBadges";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Cards das solicitações extras anexadas ao chamado. Cada card pode ser
 * finalizado individualmente (uma baixa por vez), sem encerrar o chamado.
 */
export function SolicitacaoCards({
  ticketId,
  ticketStatus,
  canFinalize,
}: {
  ticketId: string;
  ticketStatus: TicketStatus;
  canFinalize: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { takeNativePhoto } = useMobileFeatures();
  const { data: solicitacoes = [] } = useQuery({
    queryKey: ["ticket-solicitacoes", ticketId],
    queryFn: () => fetchTicketSolicitacoes(ticketId),
  });

  const [target, setTarget] = useState<SolicitacaoRow | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
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
    qc.invalidateQueries({ queryKey: ["ticket-solicitacoes", ticketId] });
    qc.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
  };

  if (solicitacoes.length === 0) return null;

  return (
    <>
      {solicitacoes.map((s, i) => (
        <SolicitacaoCard
          key={s.id}
          solicitacao={s}
          index={i + 2}
          canFinalize={canFinalize}
          onFinalize={() => {
            setTarget(s);
            setNote("");
            setFile(null);
          }}
        />
      ))}

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
  canFinalize,
  onFinalize,
}: {
  solicitacao: SolicitacaoRow;
  index: number;
  canFinalize: boolean;
  onFinalize: () => void;
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
            {done ? "Finalizada" : "Em aberto"}
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

      {!done && canFinalize && (
        <div className="mt-4">
          <Button size="sm" onClick={onFinalize}>
            <CheckCircle2 className="h-4 w-4" /> Dar Baixa nesta Solicitação
          </Button>
        </div>
      )}
    </div>
  );
}
