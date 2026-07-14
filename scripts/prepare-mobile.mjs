// Prepara os arquivos estáticos do build SPA para empacotamento com o Capacitor.
//
// No build mobile (MOBILE_BUILD=true, modo SPA do TanStack Start) os assets do
// cliente são gerados em "dist/client" e o shell estático em
// "dist/client/_shell.html". O Capacitor espera uma pasta "dist" (webDir) com um
// "index.html" na raiz. Este script:
//   1. move o conteúdo de "dist/client" para a raiz de "dist";
//   2. renomeia/garante o "index.html" a partir do shell SPA (_shell.html);
//   3. remove artefatos de servidor que não são usados no app nativo.
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  copyFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const dest = resolve(root, "dist");

// Origem dos assets estáticos do cliente (varia conforme a versão/preset).
const clientCandidates = [
  resolve(dest, "client"),
  resolve(root, ".output/public"),
  resolve(root, ".vinxi/build/client"),
];

const source = clientCandidates.find((p) => existsSync(p));
if (!source) {
  console.error(
    "[prepare-mobile] Não encontrei os assets estáticos do cliente. Rode 'npm run build:mobile'.",
  );
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

// Se os assets estão em uma subpasta de dist (dist/client), promovemos para a raiz.
if (source !== dest) {
  cpSync(source, dest, { recursive: true });
  if (source.startsWith(dest + "/")) {
    rmSync(source, { recursive: true, force: true });
  }
}

// Artefatos de servidor não são necessários no pacote nativo (SPA puro).
rmSync(join(dest, "server"), { recursive: true, force: true });
rmSync(join(dest, "nitro.json"), { force: true });
rmSync(join(dest, "package.json"), { force: true });
rmSync(join(dest, "package-lock.json"), { force: true });

// Garante um index.html na raiz a partir do shell SPA.
const destFiles = readdirSync(dest);
if (!destFiles.includes("index.html")) {
  const fallback = ["_shell.html", "200.html", "404.html"].find((f) =>
    destFiles.includes(f),
  );
  if (fallback) {
    copyFileSync(join(dest, fallback), join(dest, "index.html"));
  } else {
    console.error(
      "[prepare-mobile] Nenhum shell/index.html encontrado no build. Verifique se o modo SPA está habilitado.",
    );
    process.exit(1);
  }
}

console.log(
  `[prepare-mobile] Build SPA pronto em '${dest}' (index.html gerado para o Capacitor).`,
);
