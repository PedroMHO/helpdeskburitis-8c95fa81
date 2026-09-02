import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  countHistoryInRange,
  purgeHistoryInRange,
} from "@/lib/history-purge.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Mode = "anual" | "mensal" | "semanal";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CURRENT_YEAR = new Date().getFullYear();
const ANOS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - 5 + i);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function HistoryPurgePanel() {
  const qc = useQueryClient();
  const countFn = useServerFn(countHistoryInRange);
  const purgeFn = useServerFn(purgeHistoryInRange);

  const [mode, setMode] = useState<Mode>("anual");
  const [ano, setAno] = useState(String(CURRENT_YEAR));
  const [mes, setMes] = useState(String(new Date().getMonth()));
  const [range, setRange] = useState<DateRange | undefined>();
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  function resolveRange(): { from: string; to: string; label: string } | null {
    if (mode === "anual") {
      const y = Number(ano);
      return {
        from: new Date(y, 0, 1).toISOString(),
        to: new Date(y + 1, 0, 1).toISOString(),
        label: `ano de ${y}`,
      };
    }
    if (mode === "mensal") {
      const y = Number(ano);
      const m = Number(mes);
      return {
        from: new Date(y, m, 1).toISOString(),
        to: new Date(y, m + 1, 1).toISOString(),
        label: `${MESES[m]} de ${y}`,
      };
    }
    if (!range?.from || !range?.to) return null;
    const from = startOfDay(range.from);
    const to = startOfDay(range.to);
    to.setDate(to.getDate() + 1);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      label: `${format(from, "dd/MM/yyyy")} a ${format(range.to, "dd/MM/yyyy")}`,
    };
  }

  const resolved = resolveRange();

  const handleCount = async () => {
    if (!resolved) return toast.error("Selecione o início e o fim da semana.");
    setBusy(true);
    try {
      const res = await countFn({ data: { from: resolved.from, to: resolved.to } });
      setCount(res.count);
      toast.success(`${res.count} chamado(s) finalizado(s) no período (${resolved.label}).`);
    } catch (err) {
      toast.error("Erro ao consultar", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePurge = async () => {
    if (!resolved) return toast.error("Selecione o período.");
    setBusy(true);
    try {
      const res = await purgeFn({ data: { from: resolved.from, to: resolved.to } });
      setCount(null);
      toast.success(`${res.deleted} chamado(s) excluído(s) do histórico.`);
      qc.invalidateQueries();
    } catch (err) {
      toast.error("Erro ao excluir histórico", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl glass-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <Trash2 className="h-4 w-4 text-destructive" />
        <h2 className="font-semibold text-foreground">Limpar Histórico de Chamados</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Exclui permanentemente os chamados finalizados do período escolhido, incluindo
        fotos, solicitações e histórico. Exporte antes se quiser guardar uma cópia.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Data</Label>
          <Select
            value={mode}
            onValueChange={(v) => {
              setMode(v as Mode);
              setCount(null);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anual">Anual</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="semanal">Semanal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(mode === "anual" || mode === "mensal") && (
          <div className="space-y-2">
            <Label>Ano</Label>
            <Select value={ano} onValueChange={(v) => { setAno(v); setCount(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANOS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {mode === "mensal" && (
          <div className="space-y-2">
            <Label>Mês</Label>
            <Select value={mes} onValueChange={(v) => { setMes(v); setCount(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {mode === "semanal" && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Semana (selecione o primeiro e o último dia)
          </Label>
          <div className="rounded-lg border p-2">
            <Calendar
              mode="range"
              selected={range}
              onSelect={(r) => {
                setRange(r);
                setCount(null);
              }}
              numberOfMonths={1}
              className={cn("p-0 pointer-events-auto")}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {range?.from && range?.to
              ? `Período: ${format(range.from, "dd/MM/yyyy")} — ${format(range.to, "dd/MM/yyyy")}`
              : "Nenhum período selecionado."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={handleCount} disabled={busy || !resolved}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Consultar período
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={busy || !resolved}>
              <Trash2 className="h-4 w-4" />
              Excluir Histórico
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir histórico do período?</AlertDialogTitle>
              <AlertDialogDescription>
                Serão removidos permanentemente os chamados finalizados de{" "}
                <strong>{resolved?.label}</strong>
                {count !== null ? ` (${count} chamado(s) encontrados)` : ""}. Esta ação
                não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handlePurge}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
