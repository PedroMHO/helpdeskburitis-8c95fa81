import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchLocalidades, fetchSolicitantes } from "@/lib/data";
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
  head: () => ({ meta: [{ title: "Abrir Chamado — HelpDesk Buritis" }] }),
  component: NovoChamado,
});

const RATE_LIMIT_MS = 30 * 60 * 1000;

function NovoChamado() {
  const { user, isSolicitante } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });
  const { data: solicitantes = [] } = useQuery({
    queryKey: ["solicitantes"],
    queryFn: fetchSolicitantes,
  });

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("media");
  const [agendado, setAgendado] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [cidadeId, setCidadeId] = useState<string>("");
  const [bairroId, setBairroId] = useState<string>("");
  const [setorId, setSetorId] = useState<string>("");
  const [solicitanteRef, setSolicitanteRef] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Simplified form (cargo Solicitante)
  const [motivo, setMotivo] = useState("");
  const [nomeEscrito, setNomeEscrito] = useState("");
  const [remaining, setRemaining] = useState(0);

  const bairros = useMemo(
    () => (loc?.bairros ?? []).filter((b) => b.cidade_id === cidadeId),
    [loc, cidadeId],
  );
  const setores = useMemo(
    () => (loc?.setores ?? []).filter((s) => s.bairro_id === bairroId),
    [loc, bairroId],
  );
  const solsDoSetor = useMemo(
    () => solicitantes.filter((s) => s.setor_id === setorId),
    [solicitantes, setorId],
  );

  // Rate-limit countdown for the Solicitante role
  useEffect(() => {
    if (!isSolicitante || !user) return;
    let active = true;
    supabase
      .from("tickets")
      .select("created_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        const elapsed = Date.now() - new Date(data.created_at).getTime();
        if (elapsed < RATE_LIMIT_MS) setRemaining(RATE_LIMIT_MS - elapsed);
      });
    return () => {
      active = false;
    };
  }, [isSolicitante, user]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1000)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const mmss = () => {
    const total = Math.ceil(remaining / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const submitSolicitante = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (remaining > 0) return;
    if (!motivo.trim()) return toast.error("Informe o motivo do chamado.");
    if (!nomeEscrito.trim()) return toast.error("Informe o nome do solicitante.");
    setBusy(true);
    const { error } = await supabase.from("tickets").insert({
      titulo: motivo.trim().slice(0, 140),
      descricao: motivo.trim(),
      priority: "media",
      status: "aguardando",
      solicitante_id: user.id,
      solicitante_nome: nomeEscrito.trim(),
      created_by: user.id,
    });
    setBusy(false);
    if (error) {
      if (error.message.includes("rate_limit")) {
        setRemaining(RATE_LIMIT_MS);
        return toast.error("Aguarde 30 minutos entre os chamados.");
      }
      return toast.error("Erro ao abrir chamado", { description: error.message });
    }
    toast.success("Chamado aberto com sucesso!");
    setMotivo("");
    setNomeEscrito("");
    setRemaining(RATE_LIMIT_MS);
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!titulo.trim()) return toast.error("Informe o título do chamado.");
    if (agendado && !scheduledAt) return toast.error("Informe a data do agendamento.");
    setBusy(true);
    const solName = solicitanteRef
      ? solicitantes.find((s) => s.id === solicitanteRef)?.nome ?? null
      : null;
    const { error } = await supabase.from("tickets").insert({
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      priority,
      status: agendado ? "agendado" : "aguardando",
      scheduled_at: agendado ? new Date(scheduledAt).toISOString() : null,
      solicitante_id: user.id,
      solicitante_ref: solicitanteRef || null,
      solicitante_nome: solName,
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

  // --- Simplified form for cargo "Solicitante" ---
  if (isSolicitante) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Abrir Chamado</h1>
          <p className="text-sm text-muted-foreground">
            Descreva o motivo e identifique-se.
          </p>
        </div>
        <form onSubmit={submitSolicitante} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo da abertura do chamado *</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={5}
              maxLength={2000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome por escrito do solicitante *</Label>
            <Input
              id="nome"
              value={nomeEscrito}
              onChange={(e) => setNomeEscrito(e.target.value)}
              maxLength={140}
              required
            />
          </div>
          {remaining > 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> Aguarde {mmss()} para abrir um novo chamado.
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || remaining > 0}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Abrir Chamado
            </Button>
          </div>
        </form>
      </div>
    );
  }

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
              Agendado
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
            <Label>Cidade</Label>
            <Select
              value={cidadeId}
              onValueChange={(v) => {
                setCidadeId(v);
                setBairroId("");
                setSetorId("");
                setSolicitanteRef("");
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
                setSolicitanteRef("");
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
            <Select
              value={setorId}
              onValueChange={(v) => {
                setSetorId(v);
                setSolicitanteRef("");
              }}
              disabled={!bairroId}
            >
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

        <div className="space-y-2">
          <Label>Solicitante (opcional)</Label>
          <Select
            value={solicitanteRef}
            onValueChange={setSolicitanteRef}
            disabled={!setorId || solsDoSetor.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !setorId
                    ? "Selecione um setor primeiro"
                    : solsDoSetor.length === 0
                      ? "Nenhum solicitante neste setor"
                      : "Quem pediu o chamado?"
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
          <p className="text-xs text-muted-foreground">
            Se deixado em branco, você será registrado como solicitante.
          </p>
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
