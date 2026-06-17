# Deploy em VPS / Servidor Dedicado

Este app usa **TanStack Start com SSR** — ele roda como um **servidor Node**, não como
HTML estático. O arquivo `index.html` desta pasta é apenas uma página de fallback
(carregamento/redirecionamento); a aplicação real é renderizada pelo servidor.

Funciona como **site** (acessível no navegador) e como **app** (instalável via PWA,
graças ao `manifest.webmanifest` e aos ícones já configurados).

> **Build configurado para Node.js** (`nitro: { preset: 'node-server' }` em `vite.config.ts`).
> O output fica em `.output/server/index.mjs` e pode ser executado diretamente com `node`.

---

## Pré-requisitos na VPS

- **Node.js 22+** (recomendado: usar [nvm](https://github.com/nvm-sh/nvm))
- (opcional) **bun** — mais rápido para instalar dependências e build
- (opcional) **Nginx** — reverse proxy + HTTPS
- (opcional) **PM2** — mantém o processo no ar e reinicia automaticamente
- (opcional) **certbot** — SSL gratuito (Let's Encrypt)

---

## 1. Preparar variáveis de ambiente

Copie o exemplo e ajuste se necessário:

```bash
cp deploy/.env.example .env
```

As variáveis `VITE_SUPABASE_*` já estão preenchidas com os valores do projeto.

---

## 2. Build

Use o script pronto (Linux/macOS):

```bash
bash deploy/build.sh
```

Ou manualmente:

```bash
export VITE_SUPABASE_URL="https://duetwuoeupjqgjmyssqd.supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZXR3dW9ldXBqcWdqbXlzc3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0Mjc0NjgsImV4cCI6MjA5NjAwMzQ2OH0.Pnv0abKM1BCinEclelA3Kd2zGAKe3CNEvTgumSP2pdg"
export VITE_SUPABASE_PROJECT_ID="duetwuoeupjqgjmyssqd"

bun install        # ou: npm install
bun run build      # ou: npm run build
```

A saída fica em `.output/` (servidor Node + assets do cliente).

---

## 3. Rodar diretamente

```bash
node .output/server/index.mjs
# PORT padrão: 3000  (use PORT=8080 node .output/server/index.mjs para mudar)
```

---

## 4. Manter no ar com PM2 (recomendado)

```bash
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup        # habilita reinício automático no boot
```

---

## 5. Nginx + HTTPS (recomendado para produção)

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/chamados
sudo ln -s /etc/nginx/sites-available/chamados /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d seu-dominio.com.br -d www.seu-dominio.com.br
```

Depois de gerar o certificado, descomente a linha `return 301 https://...` no nginx.conf
para forçar HTTPS.

---

## 6. Alternativa: Docker

Build e rode em container:

```bash
docker build -f deploy/Dockerfile \
  --build-arg VITE_SUPABASE_URL="https://duetwuoeupjqgjmyssqd.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZXR3dW9ldXBqcWdqbXlzc3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0Mjc0NjgsImV4cCI6MjA5NjAwMzQ2OH0.Pnv0abKM1BCinEclelA3Kd2zGAKe3CNEvTgumSP2pdg" \
  --build-arg VITE_SUPABASE_PROJECT_ID="duetwuoeupjqgjmyssqd" \
  -t chamados-ti .

docker run -d -p 3000:3000 --restart unless-stopped chamados-ti
```

---

## Observações

- O backend (banco de dados, autenticação) continua hospedado no **Lovable Cloud** (Supabase).  
  O servidor dedicado só precisa das variáveis `VITE_SUPABASE_*` para o cliente se conectar.
- A pasta `deploy/` **não interfere** no build normal do Lovable.
- Para atualizar o app na VPS: execute `git pull` (ou copie os novos arquivos), rode `bash deploy/build.sh` e depois `pm2 restart chamados-ti-buritis`.
