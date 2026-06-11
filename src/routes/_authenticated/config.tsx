import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchLocalidades, fetchSolicitantes } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/config")({
  head: () => ({ meta: [{ title: "Configurações — Chamados Informática Buritis" }] }),
  component: Config,
});

function Config() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: loc } = useQuery({ queryKey: ["localidades"], queryFn: fetchLocalidades });
  const { data: solicitantes } = useQuery({ queryKey: ["solicitantes"], queryFn: fetchSolicitantes });

  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [bairroCidade, setBairroCidade] = useState("");
  const [setor, setSetor] = useState("");
  const [setorBairro, setSetorBairro] = useState("");
  const [solNome, setSolNome] = useState("");
  const [solSetor, setSolSetor] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [isAdmin, loading, navigate]);

  const bairrosOfCidade = useMemo(
    () => (loc?.bairros ?? []).filter((b) => b.cidade_id === setorBairro),
    [loc, setorBairro],
  );
  void bairrosOfCidade;

  const reload = () => qc.invalidateQueries({ queryKey: ["localidades"] });

  const addCidade = async () => {
    if (!cidade.trim()) return;
    const { error } = await supabase.from("cidades").insert({ nome: cidade.trim() });
    if (error) return toast.error("Erro", { description: error.message });
    setCidade("");
    toast.success("Cidade adicionada.");
    reload();
  };
  const addBairro = async () => {
    if (!bairro.trim() || !bairroCidade) return toast.error("Informe bairro e cidade.");
    const { error } = await supabase
      .from("bairros")
      .insert({ nome: bairro.trim(), cidade_id: bairroCidade });
    if (error) return toast.error("Erro", { description: error.message });
    setBairro("");
    toast.success("Bairro adicionado.");
    reload();
  };
  const addSetor = async () => {
    if (!setor.trim() || !setorBairro) return toast.error("Informe setor e bairro.");
    const { error } = await supabase
      .from("setores")
      .insert({ nome: setor.trim(), bairro_id: setorBairro });
    if (error) return toast.error("Erro", { description: error.message });
    setSetor("");
    toast.success("Setor adicionado.");
    reload();
  };
  const remove = async (table: "cidades" | "bairros" | "setores", id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Removido.");
    reload();
  };

  const reloadSol = () => qc.invalidateQueries({ queryKey: ["solicitantes"] });
  const addSolicitante = async () => {
    if (!solNome.trim() || !solSetor) return toast.error("Informe nome e setor.");
    const { error } = await supabase
      .from("solicitantes")
      .insert({ nome: solNome.trim(), setor_id: solSetor });
    if (error) return toast.error("Erro", { description: error.message });
    setSolNome("");
    toast.success("Solicitante adicionado.");
    reloadSol();
  };
  const removeSolicitante = async (id: string) => {
    const { error } = await supabase.from("solicitantes").delete().eq("id", id);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Removido.");
    reloadSol();
  };

  const cidadeNome = (id: string) => loc?.cidades.find((c) => c.id === id)?.nome ?? "";
  const bairroNome = (id: string) => loc?.bairros.find((b) => b.id === id)?.nome ?? "";
  const setorNome = (id: string | null) =>
    id ? loc?.setores.find((s) => s.id === id)?.nome ?? "" : "";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie a estrutura de localidades (Cidade → Bairro → Setor).
        </p>
      </div>

      {/* Cidades */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-foreground">Cidades</h2>
        <div className="flex gap-2">
          <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: São Paulo" />
          <Button onClick={addCidade}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <ul className="mt-3 divide-y">
          {(loc?.cidades ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{c.nome}</span>
              <Button variant="ghost" size="icon" onClick={() => remove("cidades", c.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* Bairros */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-foreground">Bairros</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex: Centro" />
          <Select value={bairroCidade} onValueChange={setBairroCidade}>
            <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
            <SelectContent>
              {(loc?.cidades ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addBairro}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <ul className="mt-3 divide-y">
          {(loc?.bairros ?? []).map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2 text-sm">
              <span>{b.nome} <span className="text-muted-foreground">· {cidadeNome(b.cidade_id)}</span></span>
              <Button variant="ghost" size="icon" onClick={() => remove("bairros", b.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* Setores */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-foreground">Setores</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={setor} onChange={(e) => setSetor(e.target.value)} placeholder="Ex: Setor de TI" />
          <Select value={setorBairro} onValueChange={setSetorBairro}>
            <SelectTrigger><SelectValue placeholder="Bairro" /></SelectTrigger>
            <SelectContent>
              {(loc?.bairros ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.nome} · {cidadeNome(b.cidade_id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addSetor}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <ul className="mt-3 divide-y">
          {(loc?.setores ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span>{s.nome} <span className="text-muted-foreground">· {bairroNome(s.bairro_id)}</span></span>
              <Button variant="ghost" size="icon" onClick={() => remove("setores", s.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* Solicitantes */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-foreground">Solicitantes</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Cadastre nomes de solicitantes vinculados a um setor. Eles ficam disponíveis
          na abertura de chamados.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={solNome} onChange={(e) => setSolNome(e.target.value)} placeholder="Nome do solicitante" />
          <Select value={solSetor} onValueChange={setSolSetor}>
            <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
            <SelectContent>
              {(loc?.setores ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nome} · {bairroNome(s.bairro_id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addSolicitante}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <ul className="mt-3 divide-y">
          {(solicitantes ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span>{s.nome} <span className="text-muted-foreground">· {setorNome(s.setor_id)}</span></span>
              <Button variant="ghost" size="icon" onClick={() => removeSolicitante(s.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
