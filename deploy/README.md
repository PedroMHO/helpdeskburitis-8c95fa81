# Deploy em VPS / Servidor Dedicado

Este app usa **TanStack Start com SSR** — ele roda como um **servidor Node**, não como
HTML estático. O arquivo `index.html` desta pasta é apenas uma página de fallback
(carregamento/redirecionamento); a aplicação real é renderizada pelo servidor.

Funciona como **site** (acessível no navegador) e como **app** (instalável via PWA,
graças ao `manifest.webmanifest` e aos ícones já configurados).

## Pré-requisitos na VPS

- Node.js 22+
- (opcional) bun, Nginx, PM2, certbot

## 1. Build

Defina as variáveis públicas e gere o build:

```bash
export VITE_SUPABASE_URL="https://duetwuoeupjqgjmyssqd.supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="<sua-anon-key>"
export VITE_SUPABASE_PROJECT_ID="duetwuoeupjqgjmyssqd"

bun install        # ou: npm install
bun run build      # ou: npm run build
```

A saída fica em `.output/` (servidor + assets do cliente).

## 2. Rodar

```bash
node .output/server/index.mjs
# PORT padrão: 3000  (use PORT=8080 node .output/server/index.mjs para mudar)
```

## 3. Manter no ar com PM2

```bash
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup        # habilita o boot automático
```

## 4. Nginx + HTTPS (recomendado)

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/chamados
sudo ln -s /etc/nginx/sites-available/chamados /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d seu-dominio.com.br -d www.seu-dominio.com.br
```

## 5. Alternativa: Docker

```bash
docker build -f deploy/Dockerfile \
  --build-arg VITE_SUPABASE_URL="https://duetwuoeupjqgjmyssqd.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="<sua-anon-key>" \
  --build-arg VITE_SUPABASE_PROJECT_ID="duetwuoeupjqgjmyssqd" \
  -t chamados-ti .

docker run -d -p 3000:3000 --restart unless-stopped chamados-ti
```

## Observações

- O backend (banco/auth) continua hospedado no Lovable Cloud; o servidor só
  precisa das variáveis `VITE_SUPABASE_*` para o cliente se conectar.
- A pasta `deploy/` não interfere no build do Lovable.
