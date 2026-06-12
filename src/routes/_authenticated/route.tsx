import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Headset,
  History,
  LayoutDashboard,
  Ticket,
  PlusCircle,
  User,
  Users,
  Settings,
  ClipboardList,
  CalendarClock,
  Wrench,
  LogOut,
  Menu,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

interface NavRoleFlags {
  isAdmin: boolean;
  isTecnico: boolean;
  isAtendente: boolean;
  isSolicitante: boolean;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: (a: NavRoleFlags) => boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard, show: () => true },
  { to: "/tickets", label: "Chamados", icon: Ticket, show: ({ isSolicitante }) => !isSolicitante },
  {
    to: "/agendados",
    label: "Chamados Agendados",
    icon: CalendarClock,
    show: ({ isSolicitante }) => !isSolicitante,
  },
  {
    to: "/manutencao",
    label: "Em Manutenção",
    icon: Wrench,
    show: ({ isSolicitante }) => !isSolicitante,
  },
  {
    to: "/pendentes",
    label: "Pendentes de Conclusão",
    icon: ClipboardList,
    show: ({ isAdmin, isTecnico, isAtendente }) =>
      isAdmin || isTecnico || isAtendente,
  },
  { to: "/historico", label: "Histórico", icon: History, show: ({ isSolicitante }) => !isSolicitante },
  {
    to: "/tickets/novo",
    label: "Abrir Chamado",
    icon: PlusCircle,
    show: ({ isAdmin }) => !isAdmin,
  },
  {
    to: "/lancamentos",
    label: "Lançamentos (Admin)",
    icon: ClipboardList,
    show: ({ isAdmin }) => isAdmin,
  },
  {
    to: "/usuarios",
    label: "Usuários",
    icon: Users,
    show: ({ isAdmin }) => isAdmin,
  },
  {
    to: "/config",
    label: "Configurações",
    icon: Settings,
    show: ({ isAdmin }) => isAdmin,
  },
  { to: "/perfil", label: "Meu Perfil", icon: User, show: () => true },
];

function AuthenticatedLayout() {
  const { user, loading, profile, isAdmin, isTecnico, isAtendente, isSolicitante, signOut } =
    useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const roleLabel = isAdmin
    ? "Administrador"
    : isTecnico
      ? "Técnico"
      : isAtendente
        ? "Atendente"
        : isSolicitante
          ? "Solicitante"
          : "Usuário Comum";

  const items = NAV.filter((i) =>
    i.show({ isAdmin, isTecnico, isAtendente, isSolicitante }),
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Headset className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">HelpDesk Buritis</p>
            <p className="text-[11px] text-sidebar-foreground/60">Informática</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => {
            const active =
              pathname === item.to ||
              (item.to !== "/dashboard" &&
                item.to !== "/tickets/novo" &&
                pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">
              {profile?.full_name || "Usuário"}
            </p>
            <p className="text-[11px] text-sidebar-foreground/60">{roleLabel}</p>
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth", replace: true });
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold lg:hidden">HelpDesk Buritis</span>
          <div className="ml-auto">
            <NotificationsBell />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
