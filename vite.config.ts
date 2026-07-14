// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Quando MOBILE_BUILD=true (usado pelo script "build:mobile"), geramos um build
// SPA estático dedicado ao Capacitor:
//   - habilitamos o modo SPA do TanStack Start, que prerenderiza um shell
//     "index.html" estático (sem SSR em runtime);
//   - desabilitamos o plugin nitro (deploy) para usar a saída padrão do
//     TanStack Start, compatível com o prerender do shell;
//   - não sobrescrevemos o server entry (o wrapper de erro SSR não é usado no
//     app nativo, que roda 100% no cliente).
// O build web/SSR padrão (`vite build`) continua totalmente intacto.
const isMobileBuild = process.env.MOBILE_BUILD === "true";

export default defineConfig(
  isMobileBuild
    ? {
        tanstackStart: {
          // maskPath aponta para uma rota pública (/auth) para o shell
          // prerenderizar sem disparar os redirects de autenticação da rota "/".
          spa: { enabled: true, maskPath: "/auth" },
        },
        // Desliga o plugin de deploy (nitro) — usamos a saída estática padrão.
        nitro: false,
      }
    : {
        tanstackStart: {
          // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
          // nitro/vite builds from this
          server: { entry: "server" },
        },
        nitro: {
          preset: "node-server",
        },
      },
);
