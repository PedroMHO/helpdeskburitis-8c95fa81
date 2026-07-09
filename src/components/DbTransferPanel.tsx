import { useRef, useState } from "react";
import JSZip from "jszip";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Database,
  Download,
  Upload,
  Loader2,
  FileArchive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  exportTicketsData,
  importTicket,
  type ExportedTicket,
} from "@/lib/db-transfer.functions";

interface ManifestTicket
  extends Omit<ExportedTicket, "image_signed_url" | "id" | "closing_image_url"> {
  image_file: string | null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function DbTransferPanel() {
  const runExport = useServerFn(exportTicketsData);
  const runImport = useServerFn(importTicket);
  const fileRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const tickets = await runExport();
      if (!tickets.length) {
        toast.info("Nenhum chamado finalizado para exportar.");
        return;
      }
      const zip = new JSZip();
      const imagesDir = zip.folder("imagens")!;
      const manifest: ManifestTicket[] = [];

      for (const t of tickets) {
        let imageFile: string | null = null;
        if (t.image_signed_url && t.closing_image_url) {
          try {
            const res = await fetch(t.image_signed_url);
            if (res.ok) {
              const buf = await res.arrayBuffer();
              const ext = t.closing_image_url.split(".").pop() || "jpg";
              imageFile = `imagens/${t.id}.${ext}`;
              imagesDir.file(`${t.id}.${ext}`, buf);
            }
          } catch {
            /* imagem indisponível — segue sem ela */
          }
        }
        const {
          id: _id,
          image_signed_url: _s,
          closing_image_url: _c,
          ...rest
        } = t;
        manifest.push({ ...rest, image_file: imageFile });
      }

      zip.file("chamados.json", JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chamados-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${tickets.length} chamados exportados.`);
    } catch (err) {
      toast.error("Erro ao exportar", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setProgress(null);
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestFile = zip.file("chamados.json");
      if (!manifestFile) {
        throw new Error("Arquivo inválido: chamados.json não encontrado no ZIP.");
      }
      const manifest = JSON.parse(await manifestFile.async("string")) as ManifestTicket[];
      if (!Array.isArray(manifest) || !manifest.length) {
        throw new Error("Nenhum chamado encontrado no arquivo.");
      }

      let ok = 0;
      let fail = 0;
      setProgress({ done: 0, total: manifest.length });

      for (let i = 0; i < manifest.length; i++) {
        const m = manifest[i];
        let image_base64: string | null = null;
        let image_name: string | null = null;
        if (m.image_file) {
          const imgEntry = zip.file(m.image_file);
          if (imgEntry) {
            const buf = await imgEntry.async("arraybuffer");
            image_base64 = arrayBufferToBase64(buf);
            image_name = m.image_file.split("/").pop() ?? "foto.jpg";
          }
        }
        try {
          await runImport({
            data: {
              ticket: {
                titulo: m.titulo,
                descricao: m.descricao,
                status: m.status,
                priority: m.priority,
                solicitante_nome: m.solicitante_nome,
                closing_note: m.closing_note,
                closed_at: m.closed_at,
                scheduled_at: m.scheduled_at,
                created_at: m.created_at,
                history: m.history,
              },
              image_base64,
              image_name,
            },
          });
          ok++;
        } catch {
          fail++;
        }
        setProgress({ done: i + 1, total: manifest.length });
      }

      if (fail === 0) toast.success(`${ok} chamados importados com sucesso.`);
      else
        toast.warning(`${ok} importados, ${fail} falharam.`, {
          description: "Verifique o arquivo e tente novamente os que faltaram.",
        });
    } catch (err) {
      toast.error("Erro ao importar", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setImporting(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="space-y-4 rounded-xl glass-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-foreground">
          Relançamento de Banco de Dados
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Exporte os chamados finalizados (com descrição, resolução e foto) em um
        arquivo ZIP, ou importe um ZIP para recriar os chamados completos neste
        sistema.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Download className="h-4 w-4" /> Exportar
          </div>
          <p className="text-xs text-muted-foreground">
            Gera um ZIP com <code>chamados.json</code> e a pasta{" "}
            <code>imagens/</code>.
          </p>
          <Button onClick={handleExport} disabled={exporting} className="mt-auto">
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileArchive className="h-4 w-4" />
            )}
            Exportar chamados (ZIP)
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Upload className="h-4 w-4" /> Importar
          </div>
          <p className="text-xs text-muted-foreground">
            Selecione um ZIP gerado por esta ferramenta para recriar os chamados.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="mt-auto"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {progress
              ? `Importando ${progress.done}/${progress.total}…`
              : "Importar chamados (ZIP)"}
          </Button>
        </div>
      </div>
    </section>
  );
}
