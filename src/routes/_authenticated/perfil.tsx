import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, FileDown } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchTickets, fetchProfiles, fetchLocalidades } from "@/lib/data";
import { signedUrl } from "@/lib/helpdesk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({ meta: [{ title: "Meu Perfil — HelpDesk Buritis" }] }),
  component: Perfil,
});


function Perfil() {
  const { user, profile, roles, refresh } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [cargo, setCargo] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportDate, setReportDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [reportMonth, setReportMonth] = useState(
    () => new Date().toISOString().slice(0, 7),
  );

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setCargo(profile.cargo_setor ?? "");
      if (profile.avatar_url)
        signedUrl("avatars", profile.avatar_url).then(setAvatarUrl);
    }
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, cargo_setor: cargo })
      .eq("id", user.id);
    setBusy(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Perfil atualizado!");
    await refresh();
    qc.invalidateQueries({ queryKey: ["profiles"] });
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    const ext = f.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, f, { upsert: true });
    if (error) {
      setUploading(false);
      return toast.error("Erro no upload", { description: error.message });
    }
    await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
    setAvatarUrl(await signedUrl("avatars", path));
    setUploading(false);
    toast.success("Foto atualizada!");
    await refresh();
  };

  const generateReport = async (
    matcher: (closedAt: Date) => boolean,
    fileName: string,
    sheetName: string,
    emptyMsg: string,
  ) => {
    if (!user) return;
    setExporting(true);
    try {
      const [all, profiles, loc] = await Promise.all([
        fetchTickets(),
        fetchProfiles(),
        fetchLocalidades(),
      ]);
      const mine = all.filter(
        (t) =>
          t.status === "finalizado" &&
          t.closed_at &&
          matcher(new Date(t.closed_at)) &&
          (t.tecnico_id === user.id || t.solicitante_id === user.id),
      );
      if (mine.length === 0) {
        toast.info(emptyMsg);
        setExporting(false);
        return;
      }

      const localidadeTexto = (t: (typeof mine)[number]) => {
        const setor = loc.setores.find((s) => s.id === t.setor_id);
        const bairro = loc.bairros.find((b) => b.id === t.bairro_id);
        const cidade = loc.cidades.find((c) => c.id === t.cidade_id);
        const parts = [setor?.nome, bairro?.nome, cidade?.nome].filter(Boolean);
        return parts.length ? parts.join(" / ") : "Não informado";
      };
      const tecnicoNome = (id: string | null) =>
        profiles.find((p) => p.id === id)?.full_name ?? "Não atribuído";
      const statusLabel = (s: string) =>
        ({
          aguardando: "Aguardando",
          aguardando_agendamento: "Aguardando Agendamento",
          em_atendimento: "Em Atendimento",
          em_manutencao: "Em Manutenção",
          pronto_entrega: "Pronto para Entrega",
          finalizado: "Finalizado",
          agendado: "Agendado",
        })[s] ?? s;
      const dt = (iso: string | null) => (iso ? new Date(iso) : null);
      const dataBR = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR") : "");
      const horaBR = (d: Date | null) =>
        d ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

      const headers = [
        "Título do Chamado",
        "Setor / Localidade",
        "Técnico Responsável",
        "Data de Abertura",
        "Hora de Abertura",
        "Data de Finalização",
        "Hora de Finalização",
        "Status Atual",
        "Observações de Conclusão",
      ];
      const rows = mine.map((t) => {
        const abertura = dt(t.created_at);
        const fim = dt(t.closed_at);
        return [
          t.titulo,
          localidadeTexto(t),
          tecnicoNome(t.tecnico_id),
          dataBR(abertura),
          horaBR(abertura),
          dataBR(fim),
          horaBR(fim),
          statusLabel(t.status),
          t.closing_note ?? "",
        ];
      });

      const aoa = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Larguras (em caracteres). Observações bem mais larga para reduzir quebras.
      const colWidths = [
        32, // Título
        34, // Setor / Localidade
        24, // Técnico
        16, // Data Abertura
        14, // Hora Abertura
        18, // Data Finalização
        16, // Hora Finalização
        16, // Status
        50, // Observações de Conclusão
      ];
      ws["!cols"] = colWidths.map((wch) => ({ wch }));

      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { fgColor: { rgb: "1F3864" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "163057" } },
          bottom: { style: "thin", color: { rgb: "163057" } },
          left: { style: "thin", color: { rgb: "163057" } },
          right: { style: "thin", color: { rgb: "163057" } },
        },
      };
      // column index → horizontal alignment for body cells
      const centerCols = new Set([3, 4, 5, 6, 7]);
      const wrapCols = new Set([0, 1, 8]);

      // Estima quantas linhas visuais o texto ocupará dada a largura da coluna.
      const estimateLines = (text: string, colWidth: number) => {
        if (!text) return 1;
        // ~90% da largura é útil para caracteres médios
        const perLine = Math.max(8, Math.floor(colWidth * 0.95));
        return text
          .split("\n")
          .reduce((acc, seg) => acc + Math.max(1, Math.ceil(seg.length / perLine)), 0);
      };

      const range = XLSX.utils.decode_range(ws["!ref"]!);
      const rowHeights: { hpt: number }[] = [];
      for (let R = range.s.r; R <= range.e.r; R++) {
        let maxLines = 1;
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[addr];
          if (!cell) continue;
          if (R === 0) {
            cell.s = headerStyle;
            continue;
          }
          const isWrap = wrapCols.has(C);
          const horizontal = centerCols.has(C) ? "center" : "left";
          cell.s = {
            alignment: {
              horizontal,
              vertical: "center",
              wrapText: isWrap,
            },
            border: {
              top: { style: "thin", color: { rgb: "D9D9D9" } },
              bottom: { style: "thin", color: { rgb: "D9D9D9" } },
              left: { style: "thin", color: { rgb: "D9D9D9" } },
              right: { style: "thin", color: { rgb: "D9D9D9" } },
            },
          };
          if (isWrap) {
            maxLines = Math.max(
              maxLines,
              estimateLines(String(cell.v ?? ""), colWidths[C]),
            );
          }
          // highlight "Finalizado" status cell in light green
          if (C === 7 && cell.v === "Finalizado") {
            cell.s.fill = { fgColor: { rgb: "C6EFCE" } };
            cell.s.font = { color: { rgb: "1E7B34" }, bold: true };
          }
        }
        if (R === 0) {
          rowHeights.push({ hpt: 26 });
        } else {
          // ~15pt por linha de texto, mínimo 20pt, sem teto fixo para
          // comportar todo o conteúdo quebrado.
          rowHeights.push({ hpt: Math.max(20, maxLines * 15 + 6) });
        }
      }
      ws["!rows"] = rowHeights;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, fileName);
      toast.success(`Relatório gerado (${mine.length} chamado(s)).`);
    } finally {
      setExporting(false);
    }
  };

  const exportDaily = () => {
    const target = new Date(reportDate + "T00:00:00").toDateString();
    generateReport(
      (d) => d.toDateString() === target,
      `relatorio-diario-${reportDate}.xlsx`,
      "Relatório Diário",
      "Nenhum chamado finalizado por você nesta data.",
    );
  };

  const exportMonthly = () => {
    const [y, mo] = reportMonth.split("-").map(Number);
    generateReport(
      (d) => d.getFullYear() === y && d.getMonth() === mo - 1,
      `relatorio-mensal-${reportMonth}.xlsx`,
      "Relatório Mensal",
      "Nenhum chamado finalizado por você neste mês.",
    );
  };

  const roleLabel = roles.includes("admin")
    ? "Administrador"
    : roles.includes("tecnico")
      ? "Técnico"
      : "Usuário Comum";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
            <AvatarFallback className="text-lg">
              {fullName.slice(0, 2).toUpperCase() || "US"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-foreground">{fullName || "Usuário"}</p>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
            <span className="mt-1 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {roleLabel}
            </span>
            <div className="mt-3">
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <label className="cursor-pointer">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Trocar foto
                  <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
                </label>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4 border-t pt-5">
          <div className="space-y-2">
            <Label htmlFor="name">Nome completo</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={profile?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cargo">Cargo / Setor</Label>
            <Input id="cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-foreground">Relatórios (Excel)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Exporta uma planilha Excel (.xlsx) formatada com os chamados
          finalizados por você: título, setor/localidade, técnico, datas e
          horas de abertura e finalização, status e observações.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <Label htmlFor="report-date">Relatório Diário</Label>
            <Input
              id="report-date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            <Button className="w-full" onClick={exportDaily} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Exportar Dia
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <Label htmlFor="report-month">Relatório Mensal</Label>
            <Input
              id="report-month"
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
            />
            <Button className="w-full" onClick={exportMonthly} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              Exportar Mês
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
