import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import { fetchTickets } from "@/lib/data";
import { PriorityBadge, StatusBadge } from "@/components/TicketBadges";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [{ title: "Histórico — HelpDesk Buritis" }],
  }),
  component: Historico,
});

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Best date to represent when a ticket was finalized. */
function refDate(t: { closed_at: string | null; created_at: string }) {
  return new Date(t.closed_at ?? t.created_at);
}

function Historico() {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchTickets,
  });

  const [q, setQ] = useState("");
  const [ano, setAno] = useState<string>("all");
  const [mes, setMes] = useState<string>("all");
  const [dia, setDia] = useState<string>("all");

  const finalizados = useMemo(
    () => tickets.filter((t) => t.status === "finalizado"),
    [tickets],
  );

  const anos = useMemo(() => {
    const set = new Set(finalizados.map((t) => refDate(t).getFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [finalizados]);

  const filtered = useMemo(
    () =>
      finalizados.filter((t) => {
        const d = refDate(t);
        if (ano !== "all" && d.getFullYear() !== Number(ano)) return false;
        if (mes !== "all" && d.getMonth() !== Number(mes)) return false;
        if (dia !== "all" && d.getDate() !== Number(dia)) return false;
        if (q && !t.titulo.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [finalizados, ano, mes, dia, q],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico</h1>
        <p className="text-sm text-muted-foreground">
          {filtered.length} chamado(s) finalizado(s)
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título..."
            className="pl-9"
          />
        </div>
        <Select value={dia} onValueChange={setDia}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Dia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo dia</SelectItem>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo mês</SelectItem>
            {MESES.map((m, i) => (
              <SelectItem key={m} value={String(i)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo ano</SelectItem>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <History className="h-8 w-8" />
          <p className="text-sm">Nenhum chamado finalizado encontrado.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              to="/tickets/$id"
              params={{ id: t.id }}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight text-foreground">
                  {t.titulo}
                </h3>
                <PriorityBadge priority={t.priority} />
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {t.descricao || "Sem descrição."}
              </p>
              <div className="mt-auto flex items-center justify-between pt-1">
                <StatusBadge status={t.status} />
                <span className="text-xs text-muted-foreground">
                  {refDate(t).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
