# Build

Use an agent to create your application in a live browser workspace.

Build is an anonymous browser-based app builder MVP. It runs a Vite/React project inside a StackBlitz WebContainer, shows a live preview, chats with an LLM through local Ollama or OpenRouter, and exports the generated code as a ZIP file.

## Features

- Browser-hosted development runtime via StackBlitz WebContainers
- Live preview pane with loading/waiting animations
- Agent chat powered by Ollama by default or OpenRouter optionally
- Starter React app with PGlite for browser-local Postgres-style storage
- In-browser file viewer/editor and runtime logs
- Cancel, reset, clear chat, and connection test controls
- Export current project as a compressed ZIP

## Local development

```bash
npm install
npm run dev
```

Open the shown local URL in Chrome/Chromium. WebContainers require cross-origin isolation; `vite.config.ts` sets the needed headers for local dev.

Run checks:

```bash
npm test
npm run build
```

## Local Ollama

Build defaults to Ollama at:

```text
http://localhost:11434
```

with model:

```text
glm-5:cloud
```

If the browser cannot call Ollama because of CORS, restart Ollama with the app origin allowed:

```bash
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

For a deployed Render URL, use that origin instead, for example:

```bash
OLLAMA_ORIGINS=https://build.onrender.com ollama serve
```

You can also use another installed model, such as `qwen3.6:27b-coding-nvfp4`.

## OpenRouter fallback

Switch the provider to OpenRouter in the UI and paste a personal OpenRouter API key. It is stored only in `localStorage` in your browser.

For production, replace browser-side model calls with a backend proxy for key protection, auth/rate limits, persistence, and billing.

## Deploy to Render

This repo includes `render.yaml` for a static Render deployment. The blueprint sets the required WebContainer headers:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Render build command:

```bash
npm ci && npm run build
```

Publish directory:

```text
./dist
```
