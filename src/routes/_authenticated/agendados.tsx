import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Search, Loader2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchTickets, fetchLocalidades, fetchTecnicos, type TicketRow } from "@/lib/data";
import { PriorityBadge, StatusBadge } from "@/components/TicketBadges";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/agendados")({
  head: () => ({
    meta: [{ title: "Chamados Agendados — HelpDesk Buritis" }],
  }),
  component: Agendados,
});

const UNASSIGNED = "__none__";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function Agendados() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: fetchTickets,
  });
  const { data: loc } = useQuery({
    queryKey: ["localidades"],
    queryFn: fetchLocalidades,
  });
  const { data: tecnicos = [] } = useQuery({
    queryKey: ["tecnicos"],
    queryFn: fetchTecnicos,
  });

  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<TicketRow | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [tecnicoId, setTecnicoId] = useState<string>(UNASSIGNED);
  const [deleting, setDeleting] = useState<TicketRow | null>(null);
  const [busy, setBusy] = useState(false);

  const setorNome = (id: string | null) =>
    id ? loc?.setores.find((s) => s.id === id)?.nome ?? null : null;
  const tecNome = (id: string | null) =>
    id ? tecnicos.find((p) => p.id === id)?.full_name ?? "—" : "Não atribuído";

  const filtered = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.status === "agendado" &&
          (!q || t.titulo.toLowerCase().includes(q.toLowerCase())),
      ),
    [tickets, q],
  );

  const openEdit = (t: TicketRow) => {
    setEditing(t);
    setScheduleAt(toLocalInput(t.scheduled_at));
    setTecnicoId(t.tecnico_id ?? UNASSIGNED);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase
      .from("tickets")
      .update({
        scheduled_at: scheduleAt ? new Date(scheduleAt).toISOString() : null,
        tecnico_id: tecnicoId === UNASSIGNED ? null : tecnicoId,
      })
      .eq("id", editing.id);
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Agendamento atualizado!");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const excluir = async () => {
    if (!deleting) return;
    setBusy(true);
    const { error } = await supabase.from("tickets").delete().eq("id", deleting.id);
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Chamado excluído!");
    setDeleting(null);
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chamados Agendados</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} chamado(s) agendado(s)
            {!isAdmin && " · somente visualização"}
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl glass-card p-12 text-center text-muted-foreground">
          <CalendarClock className="h-8 w-8" />
          <p className="text-sm">Nenhum chamado agendado.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-xl glass-card p-4 shadow-sm"
            >
              <Link
                to="/tickets/$id"
                params={{ id: t.id }}
                className="flex items-start justify-between gap-2"
              >
                <h3 className="font-semibold leading-tight text-foreground hover:underline">
                  {t.titulo}
                </h3>
                <PriorityBadge priority={t.priority} />
              </Link>
              <p className="text-xs font-medium text-primary">
                Setor: {setorNome(t.setor_id) ?? "Não informado"}
              </p>
              <div className="rounded-lg bg-muted/40 p-2 text-xs">
                <p className="font-medium text-foreground">
                  📅{" "}
                  {t.scheduled_at
                    ? new Date(t.scheduled_at).toLocaleString("pt-BR")
                    : "Sem data definida"}
                </p>
                <p className="text-muted-foreground">Técnico: {tecNome(t.tecnico_id)}</p>
              </div>
              <div className="mt-auto flex items-center justify-between pt-1">
                <StatusBadge status={t.status} />
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeleting(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sched">Data e hora planejadas</Label>
              <Input
                id="sched"
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Técnico responsável</Label>
              <Select value={tecnicoId} onValueChange={setTecnicoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Não atribuído</SelectItem>
                  {tecnicos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chamado agendado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O chamado será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluir}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
