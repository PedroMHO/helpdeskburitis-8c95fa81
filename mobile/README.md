# Empacotar como APK Android (Capacitor)

Este projeto pode ser empacotado como aplicativo Android usando o Capacitor.
O app se comunica diretamente com o Supabase (back-end) a partir do dispositivo,
sem depender do navegador.

## Pré-requisitos

- Node.js 20+
- Android Studio instalado (com SDK e um emulador ou dispositivo)
- Java JDK 17

## 1. Instalar as dependências do Capacitor

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

## 2. Gerar os arquivos estáticos

```bash
npm run build:mobile
```

Isso roda o build do Vite e copia os assets estáticos para a pasta `dist`
(definida como `webDir` em `capacitor.config.ts`).

## 3. Adicionar a plataforma Android (apenas na primeira vez)

```bash
npm run cap:add:android
```

## 4. Sincronizar e abrir no Android Studio

```bash
npm run cap:run:android
```

Esse comando: gera o build, sincroniza os arquivos com o projeto Android e
abre o Android Studio. Lá você pode rodar no emulador/dispositivo ou gerar o
APK em **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Comandos disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run build:mobile` | Build do Vite + preparação dos assets em `dist` |
| `npm run cap:add:android` | Adiciona a plataforma Android (1ª vez) |
| `npm run cap:sync` | Build + sincroniza com o Android |
| `npm run cap:open:android` | Abre o projeto no Android Studio |
| `npm run cap:run:android` | Build + sync + abre o Android Studio |

## Observações

- As credenciais do Supabase já são embutidas no build via variáveis `VITE_*`.
- A chave usada é a publishable (anon) key, segura para uso no cliente; o
  acesso aos dados continua protegido pelas políticas RLS do banco.
