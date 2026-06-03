import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchProfiles, fetchTecnicos, fetchLocalidades } from "@/lib/data";
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

export const Route = createFileRoute("/_authenticated/lancamentos")({
  head: () => ({ meta: [{ title: "Lançamentos — Chamados Informática Buritis" }] }),
  component: Lancamentos,
});

function Lancamentos() {
  const { user, isAdmin, isAtendente, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: profiles = [] } = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const { data: tecnicos = [] } = useQuery({ queryKey: ["tecnicos"], queryFn: fetchTecnicos });
  const { data: loc } = useQuery({ queryKey: ["localidades"], queryFn: fetchLocalidades });

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("media");
  const [solicitante, setSolicitante] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [agendado, setAgendado] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [cidadeId, setCidadeId] = useState("");
  const [bairroId, setBairroId] = useState("");
  const [setorId, setSetorId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin && !isAtendente)
      navigate({ to: "/dashboard", replace: true });
  }, [isAdmin, isAtendente, loading, navigate]);

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
    if (!titulo.trim()) return toast.error("Informe o título.");
    if (!solicitante) return toast.error("Selecione o solicitante.");
    if (!setorId) return toast.error("A localidade (setor) é obrigatória.");
    if (agendado && !scheduledAt) return toast.error("Informe a data do agendamento.");
    setBusy(true);
    const { error } = await supabase.from("tickets").insert({
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      priority,
      solicitante_id: solicitante,
      created_by: user.id,
      tecnico_id: tecnico || null,
      status: agendado ? "agendado" : "aguardando",
      scheduled_at: agendado ? new Date(scheduledAt).toISOString() : null,
      cidade_id: cidadeId || null,
      bairro_id: bairroId || null,
      setor_id: setorId,
    });
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado lançado com sucesso!");
    setTitulo("");
    setDescricao("");
    setAgendado(false);
    setScheduledAt("");
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel de Lançamento</h1>
          <p className="text-sm text-muted-foreground">
            Abra chamados em nome de qualquer usuário e atribua a um técnico.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="titulo">Título *</Label>
          <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={140} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Descrição</Label>
          <Textarea id="desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} maxLength={2000} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Solicitante *</Label>
            <Select value={solicitante} onValueChange={setSolicitante}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Atribuir a técnico</Label>
            <Select value={tecnico} onValueChange={setTecnico}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                {tecnicos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Prioridade *</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <Label>Status inicial</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={agendado ? "outline" : "default"}
              size="sm"
              onClick={() => setAgendado(false)}
            >
              Aguardando
            </Button>
            <Button
              type="button"
              variant={agendado ? "default" : "outline"}
              size="sm"
              onClick={() => setAgendado(true)}
            >
              Agendar Chamado
            </Button>
          </div>
          {agendado && (
            <div className="space-y-2">
              <Label htmlFor="sched">Data do agendamento</Label>
              <Input
                id="sched"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ao chegar a data, o chamado passa automaticamente para prioridade Alta.
              </p>
            </div>
          )}
        </div>


        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Cidade *</Label>
            <Select value={cidadeId} onValueChange={(v) => { setCidadeId(v); setBairroId(""); setSetorId(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(loc?.cidades ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Bairro *</Label>
            <Select value={bairroId} onValueChange={(v) => { setBairroId(v); setSetorId(""); }} disabled={!cidadeId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {bairros.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Setor *</Label>
            <Select value={setorId} onValueChange={setSetorId} disabled={!bairroId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {setores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Lançar Chamado
          </Button>
        </div>
      </form>

      <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
        Dica: para promover usuários a Técnico ou Administrador, use a área de
        backend de gerenciamento de papéis.
      </p>
    </div>
  );
}
