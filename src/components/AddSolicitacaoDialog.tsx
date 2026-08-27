import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchSolicitantes, fetchLocalidades, type TicketRow } from "@/lib/data";
import { PRIORITY_LABEL, asDbStatus, type TicketPriority } from "@/lib/helpdesk";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Adds a new request (solicitação) to an existing ticket. Same fields as the
 * "novo chamado" form, minus the location — the sector is inherited from the
 * ticket and cannot be changed.
 */
export function AddSolicitacaoDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Pick<TicketRow, "id" | "descricao" | "setor_id" | "status">;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: solicitantes = [] } = useQuery({
    queryKey: ["solicitantes"],
    queryFn: fetchSolicitantes,
  });
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });

  const [descricao, setDescricao] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("media");
  const [solicitanteRef, setSolicitanteRef] = useState("");
  const [busy, setBusy] = useState(false);

  const setorNome = useMemo(
    () =>
      (loc?.setores ?? []).find((s) => s.id === ticket.setor_id)?.nome ??
      "Setor do chamado",
    [loc, ticket.setor_id],
  );
  const solsDoSetor = useMemo(
    () => solicitantes.filter((s) => s.setor_id === ticket.setor_id),
    [solicitantes, ticket.setor_id],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!descricao.trim()) return toast.error("Descreva a nova solicitação.");
    setBusy(true);
    const solName = solicitanteRef
      ? solicitantes.find((s) => s.id === solicitanteRef)?.nome ?? null
      : null;

    // Cada solicitação vira um registro próprio, exibido como um card
    // separado no chamado e finalizável individualmente. O trigger no banco
    // dispara a notificação para a equipe e para o técnico responsável.
    const { error } = await supabase.from("ticket_solicitacoes").insert({
      ticket_id: ticket.id,
      descricao: descricao.trim(),
      priority,
      solicitante_ref: solicitanteRef || null,
      solicitante_nome: solName,
      created_by: user.id,
    });

    if (!error) {
      await supabase.from("ticket_history").insert({
        ticket_id: ticket.id,
        from_status: asDbStatus(ticket.status),
        to_status: asDbStatus(ticket.status),
        changed_by: user.id,
        note: `Nova solicitação${solName ? ` (${solName})` : ""}: ${descricao.trim()}`,
      });
    }
    setBusy(false);
    if (error)
      return toast.error("Erro ao adicionar solicitação", {
        description: error.message,
      });
    toast.success("Solicitação adicionada ao chamado!");
    setDescricao("");
    setSolicitanteRef("");
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["ticket", ticket.id] });
    qc.invalidateQueries({ queryKey: ["ticket-solicitacoes", ticket.id] });
    qc.invalidateQueries({ queryKey: ["ticket-history", ticket.id] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4" /> Adicionar Solicitação
          </DialogTitle>
          <DialogDescription>
            A solicitação será anexada ao chamado do setor {setorNome}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nova-desc">Descrição da solicitação *</Label>
            <Textarea
              id="nova-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ex.: Problema na internet, computador não liga..."
            />
          </div>
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as TicketPriority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Solicitante (opcional)</Label>
            <Select
              value={solicitanteRef}
              onValueChange={setSolicitanteRef}
              disabled={solsDoSetor.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    solsDoSetor.length === 0
                      ? "Nenhum solicitante neste setor"
                      : "Quem pediu?"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {solsDoSetor.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
