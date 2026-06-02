import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchLocalidades } from "@/lib/data";
import { PRIORITY_LABEL, type TicketPriority } from "@/lib/helpdesk";
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

export const Route = createFileRoute("/_authenticated/tickets/novo")({
  head: () => ({ meta: [{ title: "Abrir Chamado — Chamados Informática Buritis" }] }),
  component: NovoChamado,
});

function NovoChamado() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("media");
  const [agendado, setAgendado] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [cidadeId, setCidadeId] = useState<string>("");
  const [bairroId, setBairroId] = useState<string>("");
  const [setorId, setSetorId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const bairros = useMemo(
    () => (loc?.bairros ?? []).filter((b) => b.cidade_id === cidadeId),
    [loc, cidadeId],
  );
  const setores = useMemo(
    () => (loc?.setores ?? []).filter((s) => s.bairro_id === bairroId),
    [loc, bairroId],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!titulo.trim()) return toast.error("Informe o título do chamado.");
    setBusy(true);
    const { error } = await supabase.from("tickets").insert({
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      priority,
      solicitante_id: user.id,
      created_by: user.id,
      cidade_id: cidadeId || null,
      bairro_id: bairroId || null,
      setor_id: setorId || null,
    });
    setBusy(false);
    if (error) return toast.error("Erro ao abrir chamado", { description: error.message });
    toast.success("Chamado aberto com sucesso!");
    qc.invalidateQueries({ queryKey: ["tickets"] });
    navigate({ to: "/tickets" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Abrir Chamado</h1>
        <p className="text-sm text-muted-foreground">
          Descreva o problema com o máximo de detalhes.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="titulo">Título *</Label>
          <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Descrição</Label>
          <Textarea id="desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5} maxLength={2000} />
        </div>
        <div className="space-y-2">
          <Label>Prioridade</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
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

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Select
              value={cidadeId}
              onValueChange={(v) => {
                setCidadeId(v);
                setBairroId("");
                setSetorId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(loc?.cidades ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Bairro</Label>
            <Select
              value={bairroId}
              onValueChange={(v) => {
                setBairroId(v);
                setSetorId("");
              }}
              disabled={!cidadeId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {bairros.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Setor</Label>
            <Select value={setorId} onValueChange={setSetorId} disabled={!bairroId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {setores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/tickets" })}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Abrir Chamado
          </Button>
        </div>
      </form>
    </div>
  );
}
