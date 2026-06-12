import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchNotifications } from "@/lib/data";
import {
  ensureNotificationPermission,
  showNativeNotification,
} from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [openPop, setOpenPop] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    enabled: !!user,
  });

  // Solicita permissão de notificações nativas ao abrir o app.
  useEffect(() => {
    if (user) void ensureNotificationPermission();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-" + user.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as {
            title: string;
            body: string | null;
            ticket_id: string | null;
          };
          // Toast interno — clique redireciona ao chamado.
          toast(n.title, {
            description: n.body ?? undefined,
            action: n.ticket_id
              ? {
                  label: "Abrir",
                  onClick: () =>
                    navigate({ to: "/tickets/$id", params: { id: n.ticket_id! } }),
                }
              : undefined,
          });
          // Notificação nativa do navegador.
          showNativeNotification({
            title: n.title,
            body: n.body ?? undefined,
            ticketId: n.ticket_id,
          });
          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc, navigate]);

  const unread = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover open={openPop} onOpenChange={setOpenPop}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notificações</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <Check className="h-3.5 w-3.5" /> Marcar lidas
            </Button>
          )}
        </div>
        <ul className="max-h-80 divide-y overflow-auto">
          {notifications.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação.
            </li>
          ) : (
            notifications.map((n) => (
              <li
                key={n.id}
                className={
                  (n.read ? "px-4 py-3" : "px-4 py-3 bg-primary/5") +
                  (n.ticket_id ? " cursor-pointer hover:bg-muted/60" : "")
                }
                onClick={() => {
                  if (n.ticket_id) {
                    setOpenPop(false);
                    navigate({ to: "/tickets/$id", params: { id: n.ticket_id! } });
                  }
                }}
              >
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                {n.body && (
                  <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                )}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("pt-BR")}
                </p>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
