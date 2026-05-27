# Build Architecture

Build now uses a Gleam/Elm-style actor architecture for application state.

## Overview

React renders a snapshot from `src/store.ts` and sends user events as typed `AppMsg` messages. The store routes those messages to domain actors in `src/actors/`. Actor `update()` functions are pure: they return the next state plus typed effects. The runtime in `src/runtime/` interprets those effects and dispatches follow-up messages.

```text
React UI → dispatch(AppMsg)
  → appUpdate(AppState, AppMsg)
  → domain actor update()
  → [nextState, AppEffect[]]
  → runtime interpretEffect()
  → API / IndexedDB / WebContainer / DOM / timers
  → dispatch(result AppMsg)
```

## Domain actors

- `src/actors/settings.ts` — provider, API key, Ollama URL, model, settings modal, connection status.
- `src/actors/chat.ts` — prompt, chat messages, expanded message state.
- `src/actors/project.ts` — project name, current/saved projects, files, selected file, save status.
- `src/actors/agent.ts` — agent request lifecycle and elapsed timer state.
- `src/actors/preview.ts` — preview URL, element selection mode, selected element/comment.
- `src/actors/webcontainer.ts` — boot/remount phase, logs, hydration and autosave suppression flags.

## Runtime responsibilities

`src/runtime/index.ts` owns impure work:

- localStorage writes for model settings;
- Ollama connection test fetches;
- IndexedDB project load/save/create/delete/list operations;
- WebContainer mount/install/dev-server/file-sync operations;
- `runAgent()` calls, abort controllers, request timeout, elapsed timer;
- autosave debounce timer;
- preview iframe `postMessage` via injectable adapter.

Effects are interpreted sequentially. This preserves important ordering such as applying file patches before running `npm install` when `package.json` changes.

## Agent request lifecycle

Agent requests use request IDs to ignore stale completions. Runtime abort controllers are also tied to the active request ID so an old request finishing cannot clear a newer active controller.

The app-side agent request timeout is **5 minutes** (`300_000` ms). On timeout or manual cancel, the runtime aborts the fetch signal passed into `runAgent()` and the UI shows:

```text
Request canceled or timed out after 5 minutes.
```

## Autosave

Autosave remains app-side and local-browser-only. The runtime schedules a debounced save after user-visible project/chat changes once WebContainer hydration has completed. Autosave is suppressed during remounts to avoid saving transient project state.

## Entry points

- `src/main.tsx` is now only the React entrypoint.
- `src/App.tsx` is the UI shell. It reads from `useAppStore()` and dispatches messages.
- `src/store.ts` composes state and cross-domain transitions.

## Validation

Current validation commands:

```bash
npm test
npm run build
```

At the time of this migration, the suite has 71 tests across 16 test files.
