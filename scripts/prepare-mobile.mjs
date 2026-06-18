// Prepara os arquivos estáticos do build para empacotamento com o Capacitor.
// O TanStack Start gera os assets do cliente em ".output/public".
// Copiamos esse conteúdo para "dist" (webDir do capacitor.config.ts) e
// garantimos um index.html de fallback para o roteamento SPA dentro do app.
import { existsSync, mkdirSync, cpSync, readdirSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const candidates = [
  resolve(root, ".output/public"),
  resolve(root, "dist/client"),
  resolve(root, ".vinxi/build/client"),
];

const source = candidates.find((p) => existsSync(p));
if (!source) {
  console.error(
    "[prepare-mobile] Não encontrei a pasta de assets estáticos. Rode 'npm run build' antes.",
  );
  process.exit(1);
}

const dest = resolve(root, "dist");
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });

// Fallback SPA: se não houver index.html na raiz, usa 200.html/404.html se existirem.
const destFiles = readdirSync(dest);
if (!destFiles.includes("index.html")) {
  const fallback = ["200.html", "404.html"].find((f) => destFiles.includes(f));
  if (fallback) {
    copyFileSync(join(dest, fallback), join(dest, "index.html"));
  }
}

console.log(`[prepare-mobile] Assets copiados de ${source} para ${dest}`);
