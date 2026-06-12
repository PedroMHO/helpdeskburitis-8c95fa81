import { useMemo, type ReactNode } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TicketRow } from "@/lib/data";

const SLICE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#eab308",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
];

const WEEKDAY_LABELS = [
  "Segunda - Feira",
  "Terça - Feira",
  "Quarta - Feira",
  "Quinta - Feira",
  "Sexta - Feira",
];

interface NamedTicketsProps {
  tickets: TicketRow[];
  /** Resolve a user id to a display name (técnico que finalizou). */
  resolveName: (id: string | null) => string;
  /** Conteúdo opcional renderizado ao lado do gráfico de barras. */
  feedSlot?: ReactNode;
}

export function DashboardCharts({ tickets, resolveName, feedSlot }: NamedTicketsProps) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthName = now.toLocaleDateString("pt-BR", { month: "long" });

  const monthTickets = useMemo(
    () =>
      tickets.filter((t) => {
        const d = new Date(t.created_at);
        return d.getFullYear() === y && d.getMonth() === m;
      }),
    [tickets, y, m],
  );

  // Gráfico 1: taxa de conclusão individual por técnico (quem finalizou).
  const perTech = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of monthTickets) {
      if (t.status === "finalizado") {
        const who = t.closed_by ?? t.tecnico_id;
        if (who) counts.set(who, (counts.get(who) ?? 0) + 1);
      }
    }
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    return Array.from(counts.entries()).map(([id, value]) => ({
      name: resolveName(id),
      value,
      pct: total ? Math.round((value / total) * 100) : 0,
    }));
  }, [monthTickets, resolveName]);

  // Gráfico 2: taxa de conclusão geral.
  const finalizados = monthTickets.filter((t) => t.status === "finalizado").length;
  const emAberto = monthTickets.length - finalizados;
  const geralData = [
    { name: "Concluídos", value: finalizados },
    { name: "Em aberto", value: emAberto },
  ];

  // Gráfico 3 (barras): dias úteis seg-sex do mês atual.
  const weekly = useMemo(() => {
    const arr = WEEKDAY_LABELS.map((label) => ({ dia: label, total: 0 }));
    for (const t of monthTickets) {
      const wd = new Date(t.created_at).getDay(); // 0=dom .. 6=sab
      if (wd >= 1 && wd <= 5) arr[wd - 1].total += 1;
    }
    return arr;
  }, [monthTickets]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-2xl border p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Taxa de Conclusão por Técnico (mês atual)
          </h2>
          {perTech.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Sem conclusões neste mês.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={perTech}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {perTech.map((_, i) => (
                    <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, _n, p) =>
                    [`${(p?.payload as { pct: number }).pct}% (${v})`, p?.payload?.name]
                  }
                />
                <Legend
                  formatter={(_v, entry) => {
                    const p = entry?.payload as unknown as { pct: number; name: string };
                    return `${p?.pct}% - ${p?.name}`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-card rounded-2xl border p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Taxa de Conclusão Geral (mês atual)
          </h2>
          {monthTickets.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Sem chamados neste mês.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={geralData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  <Cell fill="#16a34a" />
                  <Cell fill="#eab308" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass-card rounded-2xl border p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold capitalize text-foreground">
          Volumetria por Dia Útil — {monthName} / {y}
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={weekly}>
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
            <Tooltip />
            <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
