import { cn } from "@/lib/utils";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/helpdesk";

const priorityClasses: Record<TicketPriority, string> = {
  baixa: "bg-priority-baixa text-priority-baixa-foreground",
  media: "bg-priority-media text-priority-media-foreground",
  alta: "bg-priority-alta text-priority-alta-foreground",
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TicketPriority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        priorityClasses[priority],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const statusClasses: Record<TicketStatus, string> = {
  aguardando: "bg-status-aguardando/15 text-status-aguardando",
  agendado: "bg-primary/15 text-primary",
  em_atendimento: "bg-status-atendimento/15 text-status-atendimento",
  em_manutencao: "bg-priority-alta/15 text-priority-alta",
  finalizado: "bg-status-finalizado/15 text-status-finalizado",
};

export function StatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        statusClasses[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
