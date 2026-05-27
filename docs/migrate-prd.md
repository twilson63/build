# Gleam Architecture Re-architecture Proposal

**Architect D** · Build (TWilson63/build) · 2026-05-27

> Implementation note: this PRD has been implemented on `feat/migrate`. The current code uses `src/main.tsx` as a small entrypoint, `src/App.tsx` as the React shell, `src/store.ts` for composition, `src/actors/` for pure actor updates, and `src/runtime/` for side effects. Current validation: 71 tests across 16 test files plus `npm run build`. Agent requests now use a 5-minute app-side timeout.

---

## 1. Architecture Overview

The Gleam Architecture adapts Gleam/OTP's actor model for TypeScript/React. Instead of one monolithic component with 19 `useState` hooks, the app decomposes into **domain actors** — self-contained modules each owning their own state, messages, and effects. A thin runtime layer composes them and bridges to React.

### Actor Module Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      App Runtime                        │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐            │
│  │ Settings │  │  Project   │  │  Preview  │            │
│  │  Actor   │  │   Actor    │  │  Actor    │            │
│  │          │  │            │  │           │            │
│  │ State    │  │ State      │  │ State     │            │
│  │ Msg      │  │ Msg        │  │ Msg       │            │
│  │ Effect   │  │ Effect     │  │ Effect    │            │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘            │
│       │               │               │                  │
│  ┌────┴───────────────┴───────────────┴─────┐           │
│  │              Agent Actor                  │           │
│  │  State · Msg · Effect                    │           │
│  └────────────────┬─────────────────────────┘           │
│                   │                                     │
│  ┌────────────────┴─────────────────────────┐           │
│  │           WebContainer Actor              │           │
│  │  State · Msg · Effect                    │           │
│  └──────────────────────────────────────────┘           │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │           Effect Runtime                  │           │
│  │  Interprets Effect[] → real side effects  │           │
│  └──────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User event** → React dispatches a domain `Msg` into the runtime
2. **Runtime** routes the `Msg` to the correct actor's `update()`
3. **Actor's `update()`** returns `[NextState, Effect[]]` — pure function, no side effects
4. **Effect Runtime** interprets `Effect[]` — runs API calls, IndexedDB writes, DOM side-effects
5. **Effect callbacks** dispatch new `Msg`s back into the runtime (e.g., `AgentRequestSucceeded`)
6. **React** re-renders from the composed state snapshot

Key invariant: **`update()` is pure. All side effects live in `Effect` types.** This is the Gleam/Elm contract.

---

## 2. Domain Actor Inventory

### 2.1 Settings Actor — `src/actors/settings.ts`

Owns provider/model/API key configuration. Currently spread across `provider`, `apiKey`, `ollamaUrl`, `model`, `settingsOpen`, `connectionStatus` state hooks.

```typescript
// ── State ──
export type SettingsState = {
  readonly provider: AgentProvider
  readonly apiKey: string
  readonly ollamaUrl: string
  readonly model: string
  readonly settingsOpen: boolean
  readonly connectionStatus: string
}

// ── Messages ──
export type SettingsMsg =
  | { type: 'provider_changed'; provider: AgentProvider }
  | { type: 'api_key_changed'; apiKey: string }
  | { type: 'ollama_url_changed'; url: string }
  | { type: 'model_changed'; model: string }
  | { type: 'settings_toggled' }
  | { type: 'settings_closed' }
  | { type: 'connection_status_changed'; status: string }
  | { type: 'test_ollama' }

// ── Effects ──
export type SettingsEffect =
  | { type: 'persist_settings'; provider: AgentProvider; apiKey: string; ollamaUrl: string; model: string }
  | { type: 'test_ollama_connection'; url: string }

// ── Update ──
export function init(): SettingsState { /* from localStorage */ }

export function update(state: SettingsState, msg: SettingsMsg): [SettingsState, SettingsEffect[]] {
  switch (msg.type) {
    case 'provider_changed': {
      const nextModel = state.model.trim() ? state.model : (msg.provider === 'ollama' ? 'glm-5:cloud' : 'anthropic/claude-3.5-sonnet')
      return [{ ...state, provider: msg.provider, model: nextModel }, [{ type: 'persist_settings', provider: msg.provider, apiKey: state.apiKey, ollamaUrl: state.ollamaUrl, model: nextModel }]]
    }
    case 'api_key_changed':
      return [{ ...state, apiKey: msg.apiKey }, [])]
    case 'ollama_url_changed':
      return [{ ...state, ollamaUrl: msg.url }, [])]
    case 'model_changed':
      return [{ ...state, model: msg.model }, [])]
    case 'settings_toggled':
      return [{ ...state, settingsOpen: !state.settingsOpen }, [])]
    case 'settings_closed':
      return [{ ...state, settingsOpen: false }, [])]
    case 'connection_status_changed':
      return [{ ...state, connectionStatus: msg.status }, [])]
    case 'test_ollama':
      return [state, [{ type: 'test_ollama_connection', url: state.ollamaUrl }]]
    default: {
      // Exhaustiveness check — TypeScript will error if any case is missing
      const _exhaustive: never = msg
      return [state, []]
    }
  }
}
```

### 2.2 Project Actor — `src/actors/project.ts`

Owns project CRUD, project list, naming, save status, project ready flag. Currently `projectName`, `currentProjectId`, `savedProjects`, `saveStatus`, `projectReady`, `nameEditing`, `projectsOpen`.

```typescript
import type { ChatMessage } from '../agent'
import type { ProjectFile } from '../templates'

export type ProjectState = {
  readonly projectName: string
  readonly currentProjectId: string | null
  readonly savedProjects: readonly SavedProjectSnapshot[]
  readonly saveStatus: string
  readonly projectReady: boolean
  readonly nameEditing: boolean
  readonly projectsOpen: boolean
  readonly files: readonly ProjectFile[]
  readonly selectedPath: string
}

// Stripped-down version for the actor state (avoids coupling to IndexedDB types)
type SavedProjectSnapshot = {
  readonly id: string
  readonly name: string
  readonly updatedAt: string
}

export type ProjectMsg =
  | { type: 'project_loaded'; id: string; name: string; files: ProjectFile[]; messages: ChatMessage[]; selectedPath: string; updatedAt: string }
  | { type: 'project_list_refreshed'; projects: SavedProjectSnapshot[] }
  | { type: 'project_created'; id: string; name: string }
  | { type: 'project_name_changed'; name: string }
  | { type: 'project_name_editing_toggled' }
  | { type: 'projects_dialog_toggled' }
  | { type: 'projects_dialog_closed' }
  | { type: 'project_ready' }
  | { type: 'save_status_changed'; status: string }
  | { type: 'files_updated'; files: ProjectFile[] }
  | { type: 'file_applied'; path: string; content: string }
  | { type: 'selected_path_changed'; path: string }

export type ProjectEffect =
  | { type: 'load_initial_project' }
  | { type: 'save_current_project'; name: string; files: ProjectFile[]; messages: ChatMessage[]; selectedPath: string; currentProjectId: string | null }
  | { type: 'create_project'; name: string; files: ProjectFile[]; messages: ChatMessage[]; selectedPath: string }
  | { type: 'delete_project'; id: string }
  | { type: 'refresh_project_list' }
  | { type: 'persist_current_project_id'; id: string | null }
  | { type: 'write_file_to_container'; path: string; content: string }
  | { type: 'remount_project'; files: ProjectFile[] }

export function init(): ProjectState { /* starterFiles defaults */ }

export function update(state: ProjectState, msg: ProjectMsg): [ProjectState, ProjectEffect[]] {
  // ... exhaustive pattern matching on msg.type
}
```

### 2.3 Chat Actor — `src/actors/chat.ts`

Owns message history, prompt input, expanded messages. Currently `messages`, `prompt`, `expandedMessages`.

```typescript
import type { ChatMessage } from '../agent'

export type ChatState = {
  readonly messages: readonly ChatMessage[]
  readonly prompt: string
  readonly expandedMessages: ReadonlySet<number>
}

export type ChatMsg =
  | { type: 'user_sent_message'; content: string }
  | { type: 'assistant_replied'; content: string }
  | { type: 'assistant_error'; message: string }
  | { type: 'prompt_changed'; value: string }
  | { type: 'message_toggled'; index: number }
  | { type: 'chat_cleared' }

// Chat actor has no effects — it only manages UI state
export type ChatEffect = never

export function init(): ChatState {
  return { messages: [], prompt: '', expandedMessages: new Set() }
}

export function update(state: ChatState, msg: ChatMsg): [ChatState, ChatEffect[]] {
  switch (msg.type) {
    case 'user_sent_message':
      return [{ ...state, messages: [...state.messages, { role: 'user', content: msg.content }], prompt: '' }, []]
    case 'assistant_replied':
      return [{ ...state, messages: [...state.messages, { role: 'assistant', content: msg.content }] }, []]
    case 'assistant_error':
      return [{ ...state, messages: [...state.messages, { role: 'assistant', content: `Error: ${msg.message}` }] }, []]
    case 'prompt_changed':
      return [{ ...state, prompt: msg.value }, []]
    case 'message_toggled': {
      const next = new Set(state.expandedMessages)
      next.has(msg.index) ? next.delete(msg.index) : next.add(msg.index)
      return [{ ...state, expandedMessages: next }, []]
    }
    case 'chat_cleared':
      return [{ ...state, messages: [], expandedMessages: new Set() }, []]
    default: {
      const _: never = msg
      return [state, []]
    }
  }
}
```

### 2.4 Agent Actor — `src/actors/agent.ts`

Owns the agent call lifecycle: busy state, elapsed time, abort controller. Currently `busy`, `agentStartedAt`, `elapsedSeconds`, `abortRef`.

```typescript
export type AgentState = {
  readonly busy: boolean
  readonly agentStartedAt: number | null
  readonly elapsedSeconds: number
}

export type AgentMsg =
  | { type: 'agent_request_started'; startedAt: number }
  | { type: 'agent_elapsed_tick' }
  | { type: 'agent_request_succeeded'; reply: string; patches: ReadonlyArray<{ path: string; content: string }> }
  | { type: 'agent_request_failed'; message: string }
  | { type: 'agent_request_canceled' }
  | { type: 'agent_timeout_reached' }

export type AgentEffect =
  | { type: 'call_agent'; provider: AgentProvider; apiKey: string; ollamaUrl: string; model: string; userPrompt: string; files: ProjectFile[]; messages: ChatMessage[]; selectedElement?: SelectedPreviewElement; elementComment?: string }
  | { type: 'call_agent_improve'; provider: AgentProvider; apiKey: string; ollamaUrl: string; model: string; selectedElement: SelectedPreviewElement; elementComment: string; files: ProjectFile[]; messages: ChatMessage[] }
  | { type: 'start_elapsed_timer' }
  | { type: 'stop_elapsed_timer' }
  | { type: 'abort_agent' }
  | { type: 'install_if_needed'; patches: ReadonlyArray<{ path: string; content: string }> }

export function init(): AgentState {
  return { busy: false, agentStartedAt: null, elapsedSeconds: 0 }
}

export function update(state: AgentState, msg: AgentMsg): [AgentState, AgentEffect[]] {
  switch (msg.type) {
    case 'agent_request_started':
      return [{ busy: true, agentStartedAt: msg.startedAt, elapsedSeconds: 0 }, [{ type: 'start_elapsed_timer' }]]
    case 'agent_elapsed_tick':
      return state.agentStartedAt ? [{ ...state, elapsedSeconds: Math.floor((Date.now() - state.agentStartedAt) / 1000) }, []] : [state, []]
    case 'agent_request_succeeded':
      return [{ busy: false, agentStartedAt: null, elapsedSeconds: 0 }, [{ type: 'stop_elapsed_timer' }, { type: 'install_if_needed', patches: msg.patches }]]
    case 'agent_request_failed':
      return [{ busy: false, agentStartedAt: null, elapsedSeconds: 0 }, [{ type: 'stop_elapsed_timer' }]]
    case 'agent_request_canceled':
      return [{ busy: false, agentStartedAt: null, elapsedSeconds: 0 }, [{ type: 'stop_elapsed_timer' }, { type: 'abort_agent' }]]
    case 'agent_timeout_reached':
      return [{ busy: false, agentStartedAt: null, elapsedSeconds: 0 }, [{ type: 'stop_elapsed_timer' }, { type: 'abort_agent' }]]
    default: {
      const _: never = msg
      return [state, []]
    }
  }
}
```

### 2.5 Preview Actor — `src/actors/preview.ts`

Owns preview URL, element selection, selecting mode. Currently `previewUrl`, `selectingElement`, `selectedElement`, `elementComment`.

```typescript
export type PreviewState = {
  readonly previewUrl: string
  readonly selectingElement: boolean
  readonly selectedElement: SelectedPreviewElement | null
  readonly elementComment: string
}

export type PreviewMsg =
  | { type: 'preview_url_changed'; url: string }
  | { type: 'element_select_toggled' }
  | { type: 'element_selected'; element: SelectedPreviewElement }
  | { type: 'element_comment_changed'; comment: string }
  | { type: 'element_cleared' }

export type PreviewEffect =
  | { type: 'post_inspector_message'; message: 'BUILD_INSPECTOR_ENABLE' | 'BUILD_INSPECTOR_DISABLE' }

export function init(): PreviewState {
  return { previewUrl: '', selectingElement: false, selectedElement: null, elementComment: '' }
}

export function update(state: PreviewState, msg: PreviewMsg): [PreviewState, PreviewEffect[]] {
  switch (msg.type) {
    case 'preview_url_changed':
      // When URL changes while selecting, re-send inspector message
      return [{ ...state, previewUrl: msg.url }, state.selectingElement ? [{ type: 'post_inspector_message', message: 'BUILD_INSPECTOR_ENABLE' }] : []]
    case 'element_select_toggled':
      return [{ ...state, selectingElement: !state.selectingElement }, [{ type: 'post_inspector_message', message: state.selectingElement ? 'BUILD_INSPECTOR_DISABLE' : 'BUILD_INSPECTOR_ENABLE' }]]
    case 'element_selected':
      return [{ ...state, selectedElement: msg.element, elementComment: '', selectingElement: false }, [{ type: 'post_inspector_message', message: 'BUILD_INSPECTOR_DISABLE' }]]
    case 'element_comment_changed':
      return [{ ...state, elementComment: msg.comment }, []]
    case 'element_cleared':
      return [{ ...state, selectedElement: null, elementComment: '' }, []]
    default: {
      const _: never = msg
      return [state, []]
    }
  }
}
```

### 2.6 WebContainer Actor — `src/actors/webcontainer.ts`

Owns boot lifecycle, logs, busy state. Currently `busy` (shared with agent — split here), `logs`, `hydratedRef`.

```typescript
export type WebContainerState = {
  readonly booting: boolean
  readonly hydrated: boolean
  readonly logs: readonly string[]
}

export type WebContainerMsg =
  | { type: 'boot_started' }
  | { type: 'boot_succeeded' }
  | { type: 'boot_failed'; message: string }
  | { type: 'log_appended'; line: string }
  | { type: 'project_hydrated' }
  | { type: 'remount_requested'; files: ProjectFile[] }
  | { type: 'sync_files_requested' }

export type WebContainerEffect =
  | { type: 'boot_container'; files: ProjectFile[] }
  | { type: 'mount_and_install'; files: ProjectFile[] }
  | { type: 'start_dev_server' }
  | { type: 'run_npm_install' }
  | { type: 'read_files_from_container' }

export function init(): WebContainerState {
  return { booting: true, hydrated: false, logs: [] }
}

export function update(state: WebContainerState, msg: WebContainerMsg): [WebContainerState, WebContainerEffect[]] {
  switch (msg.type) {
    case 'boot_started':
      return [{ ...state, booting: true }, [{ type: 'boot_container', files: /* from project state */ [] }]]
    // ... (full exhaustive implementation)
    default: {
      const _: never = msg
      return [state, []]
    }
  }
}
```

> **Note on `busy` split:** Currently `busy` is a single boolean conflating "booting WebContainer" and "agent is thinking." In this architecture, `WebContainerState.booting` and `AgentState.busy` are separate. The React layer composes them: `const busy = agentState.busy || wcState.booting`.

---

## 3. Effect System

### 3.1 Effect Types

Every effect is a typed discriminated union. No string commands. No `Cmd` string matching.

```typescript
// src/effects.ts — Union of all domain effects

import type { SettingsEffect } from './actors/settings'
import type { ProjectEffect } from './actors/project'
import type { AgentEffect } from './actors/agent'
import type { PreviewEffect } from './actors/preview'
import type { WebContainerEffect } from './actors/webcontainer'

export type AppEffect =
  | { domain: 'settings'; payload: SettingsEffect }
  | { domain: 'project'; payload: ProjectEffect }
  | { domain: 'agent'; payload: AgentEffect }
  | { domain: 'preview'; payload: PreviewEffect }
  | { domain: 'webcontainer'; payload: WebContainerEffect }
```

This is an explicit sum type — the runtime switches on `domain` then `payload.type`. New effects require adding to this union, so the compiler catches every place that needs updating.

### 3.2 Effect Composition via Pipe

Update functions return `[State, Effect[]]`. Multiple effects compose naturally:

```typescript
// Pipe-based composition: updates that delegate to sub-actors compose effects
function appUpdate(state: AppState, msg: AppMsg): [AppState, AppEffect[]] {
  switch (msg.type) {
    case 'agent_request_succeeded': {
      const [nextAgent, agentEffects] = agentUpdate(state.agent, msg)
      const [nextProject, projectEffects] = projectUpdate(state.project, {
        type: 'save_status_changed',
        status: 'Unsaved changes',
      })
      return [
        { ...state, agent: nextAgent, project: nextProject },
        [
          ...agentEffects.map(e => ({ domain: 'agent' as const, payload: e })),
          ...projectEffects.map(e => ({ domain: 'project' as const, payload: e })),
        ],
      ]
    }
    // ...
  }
}
```

### 3.3 Effect Runtime

The effect runtime lives in `src/runtime.ts`. It's a single function that pattern-matches on `AppEffect` and performs the real side effect, dispatching new messages back into the store:

```typescript
// src/runtime.ts (simplified)
export async function interpretEffect(
  effect: AppEffect,
  dispatch: (msg: AppMsg) => void,
  getState: () => AppState,
): Promise<void> {
  switch (effect.domain) {
    case 'settings':
      return interpretSettingsEffect(effect.payload, dispatch, getState)
    case 'project':
      return interpretProjectEffect(effect.payload, dispatch, getState)
    case 'agent':
      return interpretAgentEffect(effect.payload, dispatch, getState)
    case 'preview':
      return interpretPreviewEffect(effect.payload, dispatch)
    case 'webcontainer':
      return interpretWebContainerEffect(effect.payload, dispatch, getState)
  }
}

async function interpretAgentEffect(
  effect: AgentEffect,
  dispatch: (msg: AppMsg) => void,
  getState: () => AppState,
) {
  switch (effect.type) {
    case 'call_agent': {
      try {
        const result = await runAgent({ ...effect })
        // Dispatch both: agent succeeded + file patches
        dispatch({ type: 'agent_request_succeeded', reply: result.reply, patches: result.patches })
        for (const patch of result.patches) {
          dispatch({ type: 'file_applied', path: patch.path, content: patch.content })
        }
      } catch (error) {
        dispatch({ type: 'agent_request_failed', message: error instanceof Error ? error.message : String(error) })
      }
      break
    }
    case 'abort_agent':
      // Access abort controller from ref
      break
    // ... all other cases exhaustively matched
  }
}
```

Each domain's effect interpreter lives in its own file (`src/runtime/settings.ts`, etc.), keeping the runtime modular despite being impure.

### 3.4 Cross-Domain Effects

Some effects require data from multiple actors. For example, `call_agent` needs settings (provider, API key, model) and project state (files, messages, selected element). The solution:

**The runtime reads composed state, not individual actor state.** The `call_agent` effect carries all required data from the moment the update ran — it's a snapshot, not a reference:

```typescript
// In the app-level update, when handling 'submit_prompt':
case 'submit_prompt': {
  const settings = state.settings
  const project = state.project
  const chat = state.chat
  const preview = state.preview
  
  return [
    { ...state, agent: nextAgent, chat: nextChat },
    [
      {
        domain: 'agent',
        payload: {
          type: 'call_agent',
          provider: settings.provider,
          apiKey: settings.apiKey,
          ollamaUrl: settings.ollamaUrl,
          model: settings.model,
          userPrompt: chat.prompt,  // already captured before clearing
          files: [...project.files],
          messages: [...chat.messages],
          selectedElement: preview.selectedElement ?? undefined,
          elementComment: preview.elementComment || undefined,
        },
      },
    ],
  ]
}
```

This is how Gleam actors work: they message each other with data, not shared mutable references.

---

## 4. Type-Safe Design: Making Impossible States Impossible

### 4.1 Tagged Unions with Exhaustiveness Checks

Every `Msg` type is a discriminated union. The `default` branch uses TypeScript's `never` type to guarantee compile-time exhaustiveness:

```typescript
export function update(state: SettingsState, msg: SettingsMsg): [SettingsState, SettingsEffect[]] {
  switch (msg.type) {
    case 'provider_changed': return [/* ... */, []]
    case 'api_key_changed': return [/* ... */, []]
    // ... every case handled
    default: {
      // TypeScript error if any case is missing from the union
      const _: never = msg
      return [state, []]
    }
  }
}
```

If someone adds `{ type: 'theme_changed'; theme: 'dark' }` to `SettingsMsg` but forgets to add a case, TypeScript flags it as a compile error at `const _: never = msg`.

### 4.2 Opaque State Types

Each actor's state is a branded opaque type to prevent accidental cross-domain mutation:

```typescript
// src/actors/brands.ts
export type Brand<T, B extends string> = T & { readonly __brand: B }

export type SettingsState = Brand<{
  readonly provider: AgentProvider
  readonly apiKey: string
  // ...
}, 'SettingsState'>

export type ProjectState = Brand<{
  readonly projectName: string
  // ...
}, 'ProjectState'>
```

With branded types, `SettingsState` cannot be accidentally passed where `ProjectState` is expected. The brand is erased at runtime (zero cost) but enforced at compile time.

### 4.3 Agent Request State Machine

The current code has a bug-prone pattern: `busy` and `agentStartedAt` are independent booleans that should always be consistent. The Gleam architecture makes the agent lifecycle a state machine:

```typescript
export type AgentLifecycle =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number; abortController: AbortController }
  | { status: 'timed_out' }

export type AgentState = {
  readonly lifecycle: AgentLifecycle
  readonly elapsedSeconds: number
}
```

Now `busy` is derived: `const busy = agentState.lifecycle.status === 'running'`. You can't have `agentStartedAt` without `busy` — the type makes it impossible.

### 4.4 Project State Machine

Similarly, `projectReady` + `booting` + `hydrated` form an implicit state machine. Made explicit:

```typescript
export type BootPhase =
  | { phase: 'loading_indexeddb' }
  | { phase: 'booting_container' }
  | { phase: 'installing' }
  | { phase: 'starting_dev_server' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }
```

`busy` for the WebContainer is derived: `const wcBusy = wcState.bootPhase.phase !== 'ready'`.

---

## 5. Pipe-Based Composition

### 5.1 The Pipe Pattern

In Gleam, `|>` pipes left-to-right. TypeScript doesn't have a native pipe, but we achieve the same clarity through explicit composition:

```typescript
// Instead of nested function calls:
// applyB(applyA(state, msgA), msgB)

// We pipe:
function pipe<T>(initial: T, ...fns: Array<(value: T) => T>): T {
  return fns.reduce((acc, fn) => fn(acc), initial)
}

// Example: processing multiple messages from an effect callback
const [finalState, allEffects] = messages.reduce(
  ([state, effects], msg) => {
    const [nextState, newEffects] = appUpdate(state, msg)
    return [nextState, [...effects, ...newEffects]] as const
  },
  [initialState, []] as [AppState, AppEffect[]],
)
```

### 5.2 Update Composition

The app-level update delegates to domain actors and collects their effects:

```typescript
export function appUpdate(state: AppState, msg: AppMsg): [AppState, AppEffect[]] {
  // App-level messages that span multiple actors
  switch (msg.type) {
    case 'submit_prompt': {
      if (!state.settings.model.trim() || (state.settings.provider === 'openrouter' && !state.settings.apiKey.trim())) {
        return [{ ...state, settings: { ...state.settings, settingsOpen: true } }, []]
      }
      const [nextChat, chatEffects] = chatUpdate(state.chat, { type: 'user_sent_message', content: state.chat.prompt })
      const [nextAgent, agentEffects] = agentUpdate(state.agent, { type: 'agent_request_started', startedAt: Date.now() })
      return [
        { ...state, chat: nextChat, agent: nextAgent },
        [
          ...chatEffects.map(e => ({ domain: 'chat' as const, payload: e })),
          { domain: 'settings', payload: { type: 'persist_settings', ... } },
          { domain: 'agent', payload: { type: 'call_agent', provider: state.settings.provider, ... } },
          { domain: 'agent', payload: { type: 'start_elapsed_timer' } },
        ],
      ]
    }
    case 'agent_request_succeeded': {
      const [nextAgent, agentEffects] = agentUpdate(state.agent, msg)
      const [nextProject, projectEffects] = projectUpdate(state.project, { type: 'save_status_changed', status: 'Unsaved changes' })
      return [
        { ...state, agent: nextAgent, project: nextProject },
        [
          ...agentEffects.map(e => ({ domain: 'agent' as const, payload: e })),
          ...projectEffects.map(e => ({ domain: 'project' as const, payload: e })),
          ...msg.patches.map(p => ({ domain: 'project' as const, payload: { type: 'write_file_to_container' as const, path: p.path, content: p.content } })),
          ...msg.patches.some(p => p.path === 'package.json') ? [{ domain: 'webcontainer' as const, payload: { type: 'run_npm_install' as const } }] : [],
        ],
      ]
    }
    // ... all other app-level messages
    default:
      // Route to domain actor
      return routeToActor(state, msg)
  }
}

function routeToActor(state: AppState, msg: AppMsg): [AppState, AppEffect[]] {
  // Type-narrowing: only domain-scoped messages reach here
  if (isSettingsMsg(msg)) {
    const [next, effects] = settingsUpdate(state.settings, msg)
    return [{ ...state, settings: next }, effects.map(e => ({ domain: 'settings' as const, payload: e }))]
  }
  // ... similar for each domain
  return [state, []]
}
```

---

## 6. File Plan

### New Files to Create

```
src/actors/
├── settings.ts          # SettingsState, SettingsMsg, SettingsEffect, update()
├── project.ts           # ProjectState, ProjectMsg, ProjectEffect, update()
├── chat.ts              # ChatState, ChatMsg, ChatEffect (never), update()
├── agent.ts             # AgentState, AgentMsg, AgentEffect, update()
├── preview.ts           # PreviewState, PreviewMsg, PreviewEffect, update()
├── webcontainer.ts      # WebContainerState, WcMsg, WebContainerEffect, update()
└── brands.ts            # Brand<T, B> utility type

src/runtime/
├── index.ts             # interpretEffect() dispatcher
├── settings.ts          # interpretSettingsEffect()
├── project.ts           # interpretProjectEffect()  
├── agent.ts             # interpretAgentEffect()
├── preview.ts           # interpretPreviewEffect()
└── webcontainer.ts      # interpretWebContainerEffect()

src/store.ts             # AppState, AppMsg, appUpdate(), useAppStore() (React hook)
src/App.tsx              # Thin React shell — reads store, dispatches messages
```

### Files Modified

| File | Change |
|------|--------|
| `src/main.tsx` | **Delete** (545 lines → 0). Logic moves to actors/runtime/store. |
| `src/App.tsx` | **New** (~120 lines). Thin React shell: renders UI from `useAppStore()`, dispatches `AppMsg` on events. |
| `src/store.ts` | **New** (~150 lines). Composes actor states, `appUpdate()`, React context. |
| `src/agent.ts` | **Unchanged** — existing `runAgent()` remains the impure API call; the actor wraps it. |
| `src/projects.ts` | **Unchanged** — IndexedDB functions stay impure; the project actor's effect runtime calls them. |
| `src/webcontainer.ts` | **Unchanged** — boot/mount/install functions stay impure; the WC actor's effect runtime calls them. |
| `src/templates.ts` | **Unchanged** — pure data/functions, already perfect. |
| `src/preview-inspector.ts` | **Unchanged** — pure types/functions, already perfect. |
| `src/design-guidance.ts` | **Unchanged** — pure function, already perfect. |
| `src/CodeEditor.tsx` | **Unchanged** — already a clean component. |
| `src/TerminalPanel.tsx` | **Unchanged** — already a clean component. |
| `src/editor.ts` | **Unchanged** — pure function. |
| `src/zip.ts` | **Unchanged** — pure function. |

### Total New/Modified Count

- **6 actor files** (~80–120 lines each)
- **6 runtime files** (~40–80 lines each)
- **2 core files** (store.ts, App.tsx)
- **1 brand utility** (brands.ts)
- **15 new files**, ~1100 lines total
- **main.tsx**: 545 lines → 0 (deleted)
- **Net change**: +15 files, ~550 more lines total, but each file < 120 lines and single-responsibility

---

## 7. Refactoring Steps

Every step keeps all 42 tests passing. Tests are not modified until the final integration step.

### Step 1: Extract actor types and update functions (no behavior change)

1. Create `src/actors/` with all type definitions and `update()` functions
2. Create `src/store.ts` with `AppState` composing all actor states
3. **Tests pass**: actor `update()` functions are pure — unit-testable independently

Create `src/actors/settings.ts`, `chat.ts`, `preview.ts` — the stateless actors first (no side effects needed beyond UI state). Each file exports `init()`, `State`, `Msg`, `Effect`, and `update()`.

Write new unit tests for each actor's `update()`:
- `src/actors/settings.test.ts`
- `src/actors/chat.test.ts`
- `src/actors/preview.test.ts`

**Verification**: All 42 existing tests pass. New actor tests pass.

### Step 2: Extract agent actor

1. Create `src/actors/agent.ts` with lifecycle state machine
2. This replaces the `busy`/`agentStartedAt`/`elapsedSeconds` state
3. Agent actor's `update()` is pure — it just transitions the lifecycle state machine
4. Write `src/actors/agent.test.ts`

**Verification**: All 42 existing tests pass. New agent tests pass.

### Step 3: Extract project actor

1. Create `src/actors/project.ts` with project state machine
2. Project state currently spans multiple concerns (files, save status, project list)
3. Write `src/actors/project.test.ts`

**Verification**: All 42 existing tests pass. New project tests pass.

### Step 4: Extract WebContainer actor

1. Create `src/actors/webcontainer.ts` with boot phase state machine
2. Write `src/actors/webcontainer.test.ts`

**Verification**: All 42 existing tests pass. New WC tests pass.

### Step 5: Create effect runtime

1. Create `src/runtime/` with effect interpreters
2. Each runtime module imports the impure functions from existing modules (`runAgent`, `mountProject`, `runInstall`, IndexedDB functions)
3. The runtime is not unit-tested in isolation (it's impure), but each actor's `update()` is

**Verification**: All 42 existing tests pass.

### Step 6: Create app store and wire to React

1. Create `src/store.ts` — composes all actor states into `AppState`, defines `AppMsg` union, implements `appUpdate()`
2. Uses `useSyncExternalStore` or a minimal subscription pattern (no external state library needed)
3. Create `src/App.tsx` — reads from store, dispatches messages

**Verification**: All 42 existing tests pass. App renders identically in browser.

### Step 7: Migrate main.tsx to App.tsx

This is the big cut. Replace `main.tsx`'s `App` function component with the new `App.tsx` that reads from the store:

1. Replace each `useState` with a store read
2. Replace each event handler with a `dispatch(msg)`
3. Move all UI JSX from `main.tsx` to `App.tsx` (it's the same JSX, just wired differently)
4. Delete `main.tsx`'s old `App` function

**Verification**: All 42 existing tests pass. App renders identically. Manual smoke test of all features.

### Step 8: Add cross-actor integration tests

1. Test that `submit_prompt` dispatches the right combination of actor updates
2. Test that `agent_request_succeeded` triggers file writes + chat update + save
3. Test the full lifecycle: boot → agent call → patches applied → project saved

**Verification**: All tests pass. Integration tests cover the cross-actor flows.

---

## 8. Before/After Comparison

### Before

| Metric | Value |
|--------|-------|
| `main.tsx` | 545 lines |
| `useState` hooks | 19 |
| `useRef` hooks | 3 |
| `useEffect` hooks | 7 |
| State management | Scattered across 19 `useState` calls |
| Agent call logic | Copy-pasted in `submit()` and `improveSelectedElement()` |
| Test coverage | 42 tests across 7 test files, all on pure modules |
| Files with React state | 1 (`main.tsx`) |

### After

| Metric | Value |
|--------|-------|
| `main.tsx` (entry point) | ~5 lines (just `createRoot`) |
| `App.tsx` (UI shell) | ~120 lines |
| Actor modules | 6 files, each 80–120 lines |
| Runtime modules | 6 files, each 40–80 lines |
| Store + types | 1 file, ~150 lines |
| State management | Centralized in typed `update()` functions |
| Agent call logic | Single `call_agent` effect, no duplication |
| Test coverage | 42 existing tests + 6 new actor test files (~60 new tests) |
| Files with React state | 1 (`App.tsx`) — thin dispatcher only |

### Key Improvements

1. **`main.tsx` goes from 545 → ~5 lines** — all logic extracted into testable, typed modules
2. **Zero code duplication** — `submit()` and `improveSelectedElement()` both become `call_agent` / `call_agent_improve` effects
3. **Impossible states made impossible** — `AgentLifecycle` state machine prevents `busy` without `startedAt`
4. **Exhaustiveness checking** — every `switch` on `Msg.type` has a `never` default that catches missing cases at compile time
5. **Pure update functions** — every `update()` is a pure function, trivially unit-testable without React
6. **Effect isolation** — side effects are explicit typed values, not hidden `await` calls in event handlers
7. **Cross-domain data flow is visible** — the `appUpdate()` function shows every multi-actor message routing in one place

---

## 9. Risk Assessment

### Risk 1: `useRef` values don't fit the actor model

**Impact**: Medium  
**Mitigation**: `abortRef`, `messagesRef`, `previewRef`, `autoSaveTimerRef`, `hydratedRef`, and `suppressAutoSaveRef` are escape hatches for imperative behavior. The effect runtime manages these:

- `abortRef` → Effect runtime holds the `AbortController`, `abort_agent` effect calls `.abort()` on it
- `messagesRef` → `useEffect` auto-scroll is a React concern; stays in `App.tsx` as a `useEffect` on `chatState.messages.length`
- `previewRef` → `post_inspector_message` effect uses the ref directly — this is a DOM effect, stays in the runtime
- `autoSaveTimerRef` → Replaced by the effect runtime scheduling `save_current_project` effects with debounce
- `hydratedRef` / `suppressAutoSaveRef` → These become part of the `WebContainerState.bootPhase` state machine — no refs needed

### Risk 2: Auto-save debounce timing

**Impact**: Low  
**Mitigation**: Current code uses `setTimeout(900ms)` for auto-save. In the actor model, `files_updated` / `messages_updated` effects can be debounced in the runtime. Alternatively, use a `debounced_save` effect that the runtime handles with a timer. The actor stays pure — it just emits `{ type: 'schedule_save'; delay: 900 }`.

### Risk 3: `busy` flag was shared between agent and WebContainer

**Impact**: Low  
**Mitigation**: Currently `busy` is `true` during WebContainer boot AND during agent calls. In the actor model, `WebContainerState.bootPhase` and `AgentState.lifecycle` are separate. The React component derives `busy` as `agent.lifecycle.status === 'running' || wc.bootPhase.phase !== 'ready'`. This is actually more correct — the current code has `setBusy(false)` in the boot `finally` block which can race with agent calls.

### Risk 4: Large `AppMsg` union type

**Impact**: Low  
**Mitigation**: The `AppMsg` union includes all domain messages plus cross-cutting messages. With 6 actors averaging ~7 messages each, that's ~42 message types. This is manageable — Gleam/Elm apps routinely handle 50+ variants. TypeScript's discriminated union inference handles it well. If it grows unwieldy, we can namespace further: `{ domain: 'settings'; msg: SettingsMsg }`.

### Risk 5: Effect ordering and cancellation

**Impact**: Medium  
**Mitigation**: Effects are processed sequentially. The runtime interprets them in order. For cancellation (`abort_agent`), the runtime holds the `AbortController` reference. This is equivalent to the current `abortRef` pattern but centralized. The key difference: in the current code, `cancelAgent()` is called directly from `resetProject()` and `newProject()`. In the actor model, `reset_project` emits both `{ type: 'agent'; payload: { type: 'abort_agent' } }` and `{ type: 'webcontainer'; payload: { type: 'mount_and_install'; files: starterFiles } }`.

### Risk 6: Test migration during refactoring

**Impact**: Low  
**Mitigation**: All 42 existing tests test pure modules (`agent.ts`, `projects.ts`, `webcontainer.ts`, `templates.ts`, `preview-inspector.ts`, `design-guidance.ts`, `editor.ts`, `zip.ts`). These modules are **not modified** by this re-architecture — they remain as-is. The new actor tests test the new `update()` functions. No test needs to change until the final integration step, and even then only `main.tsx`-related integration tests (if any) would change.

### Risk 7: React 19 concurrent rendering

**Impact**: Low  
**Mitigation**: The actor model actually helps here. Because `update()` is pure and returns a new state object (not mutating the old one), React 19's concurrent features work correctly. The store uses `useSyncExternalStore` which is the recommended approach for external stores in concurrent mode.

---

## Appendix A: `store.ts` Sketch

```typescript
// src/store.ts
import type { SettingsState, SettingsMsg, SettingsEffect } from './actors/settings'
import type { ProjectState, ProjectMsg, ProjectEffect } from './actors/project'
import type { ChatState, ChatMsg } from './actors/chat'
import type { AgentState, AgentMsg, AgentEffect } from './actors/agent'
import type { PreviewState, PreviewMsg, PreviewEffect } from './actors/preview'
import type { WebContainerState, WebContainerMsg, WebContainerEffect } from './actors/webcontainer'

export type AppState = {
  readonly settings: SettingsState
  readonly project: ProjectState
  readonly chat: ChatState
  readonly agent: AgentState
  readonly preview: PreviewState
  readonly webcontainer: WebContainerState
}

export type AppMsg =
  // Cross-domain messages
  | { type: 'submit_prompt' }
  | { type: 'improve_selected_element' }
  | { type: 'cancel_agent' }
  | { type: 'reset_project' }
  | { type: 'new_project' }
  | { type: 'open_project'; id: string }
  | { type: 'remove_project'; id: string }
  | { type: 'save_project' }
  // Domain-scoped messages
  | { type: 'settings'; msg: SettingsMsg }
  | { type: 'project'; msg: ProjectMsg }
  | { type: 'chat'; msg: ChatMsg }
  | { type: 'agent'; msg: AgentMsg }
  | { type: 'preview'; msg: PreviewMsg }
  | { type: 'webcontainer'; msg: WebContainerMsg }

export type AppEffect =
  | { domain: 'settings'; payload: SettingsEffect }
  | { domain: 'project'; payload: ProjectEffect }
  | { domain: 'agent'; payload: AgentEffect }
  | { domain: 'preview'; payload: PreviewEffect }
  | { domain: 'webcontainer'; payload: WebContainerEffect }

export function appInit(): AppState {
  return {
    settings: settingsInit(),
    project: projectInit(),
    chat: chatInit(),
    agent: agentInit(),
    preview: previewInit(),
    webcontainer: wcInit(),
  }
}

export function appUpdate(state: AppState, msg: AppMsg): [AppState, AppEffect[]] {
  // ... as described in Section 5.2
}

// React integration
import { useSyncExternalStore } from 'react'

type Listener = () => void

export function createStore() {
  let state = appInit()
  const listeners = new Set<Listener>()

  function getState() { return state }
  function subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function dispatch(msg: AppMsg) {
    const [nextState, effects] = appUpdate(state, msg)
    state = nextState
    listeners.forEach(l => l())
    // Process effects asynchronously
    for (const effect of effects) {
      interpretEffect(effect, dispatch, getState)
    }
  }

  return { getState, subscribe, dispatch }
}

export const store = createStore()

export function useAppStore(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState)
}

export function useDispatch(): (msg: AppMsg) => void {
  return store.dispatch
}
```

## Appendix B: `App.tsx` Sketch

```tsx
// src/App.tsx — thin React shell
import { useAppStore, useDispatch } from './store'
import type { AppMsg } from './store'
import { CodeEditor } from './CodeEditor'
import { TerminalPanel } from './TerminalPanel'
import { isSelectedElementMessage, summarizeSelectedElement } from './preview-inspector'
import { downloadZip } from './zip'
import { starterFiles } from './templates'
import { useEffect, useRef } from 'react'

export function App() {
  const state = useAppStore()
  const dispatch = useDispatch()
  const messagesRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.chat.messages.length])

  // Post inspector messages to iframe
  useEffect(() => {
    previewRef.current?.contentWindow?.postMessage(
      { type: state.preview.selectingElement ? 'BUILD_INSPECTOR_ENABLE' : 'BUILD_INSPECTOR_DISABLE' },
      '*',
    )
  }, [state.preview.selectingElement, state.preview.previewUrl])

  // Listen for element selection from iframe
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isSelectedElementMessage(event.data)) return
      dispatch({ type: 'preview', msg: { type: 'element_selected', element: event.data.element } })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const busy = state.agent.lifecycle.status === 'running' || state.webcontainer.bootPhase.phase !== 'ready'
  const selectedFile = state.project.files.find(f => f.path === state.project.selectedPath) ?? state.project.files[0]

  return (
    <div className="app">
      {/* ... JSX renders from state, dispatches on events ... */}
      {/* Every onClick becomes: dispatch({ type: '...', ... }) */}
      {/* All display data comes from: state.settings, state.project, etc. */}
    </div>
  )
}
```

The JSX is essentially the same as the current `main.tsx` JSX — ~300 lines of rendering logic, but now all data comes from the store and all mutations go through `dispatch`. No `useState`, no `useRef` for state, no `useEffect` for state synchronization.

---

## Appendix C: How This Differs from Architect C (Elm/Ports)

| Aspect | Architect C (Elm/Ports) | Architect D (Gleam Actors) |
|--------|------------------------|----------------------------|
| **Update function** | One giant `update(state, msg)` | Per-domain `update()` actors, composed at app level |
| **Message type** | One giant `Msg` union | Per-domain `Msg` unions, composed via `AppMsg` |
| **Side effects** | Stringly-typed `Cmd` ports | Strongly-typed `Effect` discriminated unions with domain tags |
| **State shape** | Single flat record | Composed actor states, each opaque to others |
| **Cross-domain** | Msg-to-Msg delegation in update | App-level `appUpdate()` routes cross-domain effects explicitly |
| **Testability** | Test `update()` but it's monolithic | Test each actor's `update()` independently |
| **Scalability** | Adding features bloats the one update | Adding features adds a new actor module |
| **Ref pattern** | `Cmd` strings matched in subscriptions | Effect runtime pattern-matches typed payloads |
| **Philosophy** | "One program, one update" | "Many actors, one composition layer" |

The Gleam architecture trades the Elm architecture's simplicity (one `update`, one `Msg`) for modularity (many `update`s, many `Msg`s). The cost is a small composition layer in `appUpdate()`. The benefit is that each actor module stays under 120 lines even as the app grows — the Elm architecture's single `update` inevitably exceeds 200+ lines.

---

*This proposal preserves all 42 existing tests, leaves pure modules untouched, and makes every state transition explicit, typed, and exhaustively checked. The `main.tsx` monolith becomes 15 focused modules, each under 120 lines.*
