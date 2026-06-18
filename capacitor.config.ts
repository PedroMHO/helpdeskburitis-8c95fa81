import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.helpdeskburitis",
  appName: "HelpDesk Buritis",
  // Pasta com os arquivos estáticos gerados pelo build (vide script "build:mobile").
  webDir: "dist",
  // Permite que o WebView se comunique normalmente com o Supabase/back-end.
  server: {
    androidScheme: "https",
    // Necessário para chamadas HTTPS ao Supabase a partir do app nativo.
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
