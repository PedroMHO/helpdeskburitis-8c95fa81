// Configuração do PM2 para manter o app SSR rodando na VPS/servidor dedicado.
// Uso: pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "chamados-ti-buritis",
      script: ".output/server/index.mjs",
      cwd: __dirname + "/..",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Variáveis públicas do cliente já são embutidas no build.
        // Defina aqui apenas segredos de servidor, se houver.
      },
      max_memory_restart: "512M",
      autorestart: true,
    },
  ],
};
