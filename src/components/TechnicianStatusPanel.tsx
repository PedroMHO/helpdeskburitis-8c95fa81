import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Headset } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchTecnicos,
  fetchTechnicianStatuses,
  fetchLocalidades,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export function TechnicianStatusPanel() {
  const qc = useQueryClient();
  const { data: tecnicos = [] } = useQuery({
    queryKey: ["tecnicos"],
    queryFn: fetchTecnicos,
  });
  const { data: statuses = [] } = useQuery({
    queryKey: ["technician-status"],
    queryFn: fetchTechnicianStatuses,
  });
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });

  useEffect(() => {
    const channel = supabase
      .channel("technician-status-panel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "technician_status" },
        () => qc.invalidateQueries({ queryKey: ["technician-status"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const setorNome = (id: string | null) =>
    id ? loc?.setores.find((s) => s.id === id)?.nome ?? "" : "";

  const label = (st?: { status: string; setor_id: string | null }) => {
    if (!st || st.status === "disponivel")
      return { text: "Disponível", cls: "bg-status-finalizado/15 text-status-finalizado" };
    if (st.status === "em_manutencao")
      return { text: "Em Manutenção", cls: "bg-priority-alta/15 text-priority-alta" };
    if (st.status === "atendendo")
      return {
        text: `Atendendo Setor: ${setorNome(st.setor_id) || "—"}`,
        cls: "bg-status-atendimento/15 text-status-atendimento",
      };
    return { text: st.status, cls: "bg-muted text-muted-foreground" };
  };

  if (tecnicos.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Headset className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Status dos Técnicos</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {tecnicos.map((t) => {
          const st = statuses.find((s) => s.user_id === t.id);
          const l = label(st);
          return (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5"
            >
              <span className="text-xs font-medium text-foreground">
                {t.full_name?.split(" ")[0] || "Técnico"}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  l.cls,
                )}
              >
                {l.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
