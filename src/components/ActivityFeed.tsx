import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrls } from "@/lib/avatars.functions";
import type { ProfileLite, TicketRow } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Cor sólida do círculo de iniciais, derivada do nome (tokens do tema). */
const AVATAR_STYLES = [
  "bg-primary text-primary-foreground",
  "bg-priority-media text-priority-media-foreground",
  "bg-priority-alta text-priority-alta-foreground",
  "bg-status-atendimento text-primary-foreground",
  "bg-status-finalizado text-primary-foreground",
  "bg-priority-baixa text-priority-baixa-foreground",
];

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatClosedAt(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time}`;
}

interface FeedItem {
  ticket: TicketRow;
  name: string;
  avatarPath: string | null;
}

/**
 * Feed de atividades estilo "comentários": foto do técnico (ou iniciais em
 * círculo colorido), nome em negrito seguido da ação, título do chamado como
 * linha secundária e data/hora discretas à direita.
 */
export function ActivityFeed({
  feed,
  profiles,
}: {
  feed: TicketRow[];
  profiles: ProfileLite[];
}) {
  const fetchAvatarUrls = useServerFn(getAvatarUrls);

  const items = useMemo<FeedItem[]>(
    () =>
      feed.map((ticket) => {
        const techId = ticket.closed_by ?? ticket.tecnico_id;
        const profile = techId
          ? profiles.find((p) => p.id === techId)
          : undefined;
        return {
          ticket,
          name: profile?.full_name || "Técnico",
          avatarPath: profile?.avatar_url ?? null,
        };
      }),
    [feed, profiles],
  );

  const avatarPaths = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((i) => i.avatarPath)
            .filter((p): p is string => Boolean(p)),
        ),
      ].sort(),
    [items],
  );

  const { data: avatarUrls = {} } = useQuery({
    queryKey: ["avatar-urls", avatarPaths],
    queryFn: async () => {
      const res = await fetchAvatarUrls({ data: { paths: avatarPaths } });
      return res.urls;
    },
    enabled: avatarPaths.length > 0,
    staleTime: 45 * 60 * 1000,
  });

  return (
    <div className="glass-card rounded-2xl border shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground">Feed de Atividades:</h2>
      </div>
      {items.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">
          Nenhuma conclusão registrada.
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-border/50 overflow-auto">
          {items.map(({ ticket, name, avatarPath }) => {
            const photoUrl = avatarPath ? avatarUrls[avatarPath] : undefined;
            return (
              <li
                key={ticket.id}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <Avatar className="h-10 w-10 shrink-0 border border-background/60 shadow-sm">
                  {photoUrl ? (
                    <AvatarImage
                      src={photoUrl}
                      alt={`Foto de ${name}`}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback
                    className={cn(
                      "text-xs font-bold",
                      AVATAR_STYLES[hashName(name) % AVATAR_STYLES.length],
                    )}
                  >
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-x-3 gap-y-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                    <p className="min-w-0 truncate text-sm text-foreground">
                      <span className="font-semibold">{name}</span>{" "}
                      <span className="text-muted-foreground">
                        Concluiu um chamado
                      </span>
                    </p>
                    {ticket.closed_at && (
                      <time
                        dateTime={ticket.closed_at}
                        className="shrink-0 text-xs text-muted-foreground"
                      >
                        {formatClosedAt(ticket.closed_at)}
                      </time>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground/80">
                    {ticket.titulo}
                  </p>
                </div>
              </li>

            );
          })}
        </ul>
      )}
    </div>
  );
}
