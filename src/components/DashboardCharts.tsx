import { useMemo } from "react";
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

export function DashboardCharts({ tickets }: { tickets: TicketRow[] }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const monthTickets = useMemo(
    () =>
      tickets.filter((t) => {
        const d = new Date(t.created_at);
        return d.getFullYear() === y && d.getMonth() === m;
      }),
    [tickets, y, m],
  );

  const finalizados = monthTickets.filter((t) => t.status === "finalizado").length;
  const abertos = monthTickets.length - finalizados;
  const pieData = [
    { name: "Finalizados", value: finalizados },
    { name: "Em aberto", value: abertos },
  ];
  const PIE_COLORS = ["var(--status-finalizado)", "var(--status-aguardando)"];

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daily = useMemo(() => {
    const arr = Array.from({ length: daysInMonth }, (_, i) => ({
      dia: String(i + 1),
      total: 0,
    }));
    for (const t of monthTickets) {
      const d = new Date(t.created_at).getDate();
      arr[d - 1].total += 1;
    }
    return arr;
  }, [monthTickets, daysInMonth]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Taxa de Resolução (mês atual)
        </h2>
        {monthTickets.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Sem chamados neste mês.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Volumetria Diária (mês atual)
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={daily}>
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={2} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
            <Tooltip />
            <Bar dataKey="total" fill="var(--primary)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
