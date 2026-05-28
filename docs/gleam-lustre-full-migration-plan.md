# Full Gleam + Lustre Migration Plan

Branch: `feat/gleam`

## Goal

Explore migrating Build from a React/TypeScript browser app to a Gleam frontend using Lustre, with JavaScript externals for browser and npm APIs that Gleam/Lustre should not own directly.

This is a larger rewrite than the incremental actor-port plan. The target architecture is:

```text
Gleam + Lustre
  ├─ UI views
  ├─ app model
  ├─ update function
  ├─ domain actors/state machines
  └─ typed effect descriptions

JavaScript externals
  ├─ WebContainer API
  ├─ CodeMirror editor wrapper
  ├─ xterm terminal wrapper
  ├─ IndexedDB/project persistence
  ├─ JSZip export
  ├─ fetch/AbortController/timers
  ├─ iframe postMessage/DOM refs
  └─ localStorage
```


## Alignment with dev2 architecture plan

The dev2 ZenBin plan is the parity baseline for this migration. This plan is aligned around these non-negotiables:

- **1:1 parity:** this is an architecture upgrade, not a redesign. The Gleam/Lustre app must keep the same URL, CSS, layout, DOM class names, timings, and interactions.
- **React remains until final cutover:** compare React and Gleam side by side until visual and feature parity pass, then remove React.
- **Pure actors first:** Settings, Chat, Preview, Agent, Project, and WebContainer each own typed `State`, `Msg`, `Effect`, and pure `update()` functions.
- **Effects are interpreted outside actors:** browser APIs, timers, refs, abort controllers, WebContainer, IndexedDB, xterm, CodeMirror, and network calls live in JS FFI/effect runtime code.
- **Reuse `styles.css` verbatim:** Lustre must render real DOM with the existing class names. Prefer light DOM custom elements so global CSS continues to apply.
- **Custom elements for imperative widgets:** CodeMirror and xterm should be wrapped as vanilla JS/Lustre custom elements with typed attributes/events, not reimplemented in Gleam.
- **Port pure TypeScript modules before risky FFI:** `templates.ts`, `preview-inspector.ts`, `design-guidance.ts`, and `editor.ts` are safe early ports and should get Gleam tests while the TS originals remain.
- **Plugin-shaped component tree:** core UI pieces should become `<build-*>` components over time (`build-editor`, `build-terminal`, `build-preview`, `build-agent-chat`, `build-project-nav`, `build-element-picker`).

Current prototype status is intentionally earlier than final architecture: it has a parallel `?gleam=1` Lustre shell and initial actor modules/tests. The next work should converge paths and phase order toward the dev2 plan below.

## Migration strategy

Do this as a **prototype branch first**, not a direct replacement PR. The existing TypeScript app is working and tested. The Gleam/Lustre rewrite should prove equivalent behavior slice by slice before replacing it.

Recommended strategy:

1. Build a parallel Gleam/Lustre app shell.
2. Reuse existing CSS and generated starter project files where possible.
3. Wrap hard JS integrations through minimal externals.
4. Port safe pure modules first, then port behavior vertically through actors/effects/components.
5. Keep the TypeScript app available until the Gleam app can pass visual and feature parity smoke checklists.

## Proposed repository layout

```text
gleam.toml
src/
  build_app.gleam              # temporary Lustre prototype entrypoint
  build/
    model.gleam                # root Model
    msg.gleam                  # root Msg
    update.gleam               # app update composition
    effect.gleam               # typed effect descriptions
    view.gleam                 # final top-level Lustre view
    actors/
      settings.gleam
      chat.gleam
      project.gleam
      agent.gleam
      preview.gleam
      webcontainer.gleam
    components/
      build_agent_chat.gleam
      build_project_nav.gleam
      build_preview.gleam
      build_editor.gleam
      build_terminal.gleam
      build_element_picker.gleam
    runtime/
      settings.gleam
      project.gleam
      agent.gleam
      preview.gleam
      webcontainer.gleam
      zip.gleam
    pure/
      templates.gleam
      preview_inspector.gleam
      design_guidance.gleam
      editor.gleam
  gleam-externals/
    local_storage.mjs
    webcontainer.mjs
    editor.mjs
    terminal.mjs
    projects.mjs
    agent.mjs
    zip.mjs
    dom.mjs
  main-gleam.ts                # temporary bootstrap for compiled Gleam app, if needed
```

This keeps Gleam source under `src/` because Gleam's default source directory is `src`, while preserving the existing TypeScript app until final cutover.

## Architecture target

### Model

Gleam owns the root model:

```gleam
type Model {
  Model(
    settings: settings.State,
    chat: chat.State,
    project: project.State,
    agent: agent.State,
    preview: preview.State,
    webcontainer: webcontainer.State,
  )
}
```

### Msg

Gleam owns root messages and domain messages:

```gleam
type Msg {
  Settings(settings.Msg)
  Chat(chat.Msg)
  Project(project.Msg)
  Agent(agent.Msg)
  Preview(preview.Msg)
  WebContainer(webcontainer.Msg)
  SubmitPrompt
  ImproveSelectedElement
  CancelAgent
  NewProject
  OpenProject(String)
  RemoveProject(String)
  ResetProject
  SaveProject(silent: Bool)
}
```

### Effects

Gleam owns effect descriptions, not effect execution:

```gleam
type Effect {
  PersistSettings(SettingsSnapshot)
  TestOllamaConnection(String)
  LoadInitialProject
  SaveCurrentProject(ProjectSnapshot, silent: Bool)
  CallAgent(AgentRequest)
  AbortAgent
  MountAndInstall(List(ProjectFile))
  WriteFile(path: String, content: String)
  PostInspectorMessage(InspectorMessage)
  ScheduleSave(delay_ms: Int)
}
```

JS externals interpret these effects. This keeps Gleam pure and avoids embedding complex browser imperative code in the update layer.

## JavaScript externals boundary

Use externals for APIs that are naturally JavaScript/browser-specific.

### WebContainer external

Responsibilities:

- boot singleton;
- mount files;
- run `npm install`;
- start dev server;
- write file;
- read syncable files;
- start shell/xterm bridge.

Gleam should only see typed callbacks/messages like:

```gleam
pub external fn mount_and_install(files: List(ProjectFile)) -> Nil =
  "../gleam-externals/webcontainer.mjs" "mountAndInstall"
```

The JS side dispatches Gleam messages on progress/result.

### Editor external

CodeMirror is the biggest UI interop question.

Options:

1. **Custom element wrapper** around CodeMirror.
   - JS defines `<build-code-editor>`.
   - Lustre renders the custom element.
   - JS emits `change` events.
   - Best for keeping Lustre as UI owner.

2. **Lustre hook/attribute interop** if ergonomic enough.
   - More direct, but may be harder to maintain.

Recommended: custom element wrapper.

### Terminal external

Same recommendation as editor:

- JS defines `<build-terminal>` backed by xterm.
- Lustre renders it with `enabled` and log props/events.
- JS owns xterm lifecycle.

### IndexedDB external

Can either:

- keep current `src/projects.ts` and expose wrappers to Gleam; or
- rewrite persistence in JS externals directly.

Recommended for first pass: reuse current `projects.ts` behavior through an external module so project storage semantics remain unchanged.

### Agent external

Reuse existing `runAgent()` implementation through JS external. Gleam creates `AgentRequest` data; JS performs fetch/OpenRouter/Ollama handling, timeout, abort controller, and result parsing.

Gleam should still model request IDs and stale-result behavior.

### DOM/iframe external

Keep iframe `postMessage`, selected-element listener setup, scrolling, and DOM focus operations in JS externals. Lustre can render the iframe, but JS should own direct DOM ref operations.

## Phased implementation

The implementation order follows the dev2 parity plan. Each phase ends with a verification gate before moving on.

### Phase 0 — Set up Gleam project

Boot the Gleam JavaScript compilation pipeline without replacing React.

Tasks:

- add `gleam.toml` targeting JavaScript;
- add Lustre;
- render a minimal Lustre app into the existing Vite page;
- keep React as the default entry while exposing the Gleam prototype behind a dev flag/query param;
- make `npm test` and `npm run build` run the Gleam build/tests too.

Success criteria:

- Gleam JavaScript target builds;
- Lustre renders in the browser;
- Vite production build includes the compiled Gleam output;
- all existing TypeScript tests still pass.

### Phase 1 — Port pure modules

Move pure functions/data first. These have no DOM, React, WebContainer, IndexedDB, or network risk.

Tasks:

- `templates.ts` → `templates.gleam`;
- `preview-inspector.ts` → `preview_inspector.gleam`;
- `design-guidance.ts` → `design_guidance.gleam`;
- `editor.ts` → `editor.gleam`.

Success criteria:

- Gleam tests cover the same behavior as the corresponding TypeScript tests;
- TypeScript originals remain in place and their tests still pass;
- no browser FFI introduced in this phase.

### Phase 2 — Build simple actors

Port the low-risk actors as pure state machines.

Tasks:

- `settings.gleam` with settings state/messages/effects;
- `chat.gleam` with chat state/messages and no effects;
- `preview.gleam` with preview URL, selected element, comment, and inspector-message effects.

Success criteria:

- pure `update(state, msg) -> #(state, effects)` functions;
- exhaustive message handling;
- Gleam actor tests pass;
- effects are descriptions only, not browser calls.

### Phase 3 — Build complex actors

Port state machines that coordinate external work.

Tasks:

- `agent.gleam` with `Idle | Running | TimedOut` lifecycle, stale request handling, elapsed timer effects, abort effects, and install-if-needed effects;
- `webcontainer.gleam` with boot/install/dev-server phases and derived busy state;
- `project.gleam` with project metadata, selected path, file application, save status, and persistence/remount effects.

Success criteria:

- impossible states are represented as impossible Gleam variants;
- stale agent request IDs are ignored;
- package install effect ordering is preserved;
- actor tests cover every transition currently covered by TypeScript tests.

### Phase 4 — Build effect runtime and FFI boundaries

Connect typed effects to real side effects through small JS FFI modules.

Tasks:

- root effect dispatcher;
- settings runtime for localStorage and Ollama test;
- project runtime for IndexedDB/current-project persistence;
- agent runtime around existing `runAgent()` plus abort/timer behavior;
- preview runtime for iframe `postMessage`;
- WebContainer runtime around current boot/mount/install/dev-server behavior;
- ZIP runtime around JSZip.

Success criteria:

- FFI bindings compile;
- effect interpreters can be tested with mocks;
- actors remain pure;
- current browser semantics remain unchanged.

### Phase 5 — Build Lustre/light-DOM components

Create isolated components before wiring the full app. Use the existing CSS class names and avoid shadow-DOM styling traps.

Tasks:

- `<build-editor>` wrapping vanilla CodeMirror 6;
- `<build-terminal>` wrapping xterm.js with buffered streaming writes;
- `<build-preview>` for iframe display and inspector events;
- `<build-agent-chat>` for messages and prompt input;
- `<build-project-nav>` for project CRUD controls;
- `<build-element-picker>` for selected-element UI.

Success criteria:

- each component renders in isolation;
- attributes/properties update component state;
- custom events emit typed parent messages;
- `styles.css` applies without duplication.

### Phase 6 — Wire the app shell

Compose actors, root update, effect runtime, and components.

Tasks:

- root `Model`, `Msg`, `Effect`, and `update`;
- Lustre app shell view using existing DOM structure/classes;
- register all `<build-*>` custom elements;
- route component events into root messages;
- route effects through the runtime.

Success criteria:

- full Gleam app renders;
- dispatch loop works;
- effect callbacks feed messages back into update;
- React app still remains available for comparison.

### Phase 7 — Visual parity verification

Compare React and Gleam at the same viewport and state.

Success criteria:

- screenshot diff is under the agreed threshold;
- DOM structure and class names match where CSS depends on them;
- computed styles match for key elements;
- responsive breakpoints match.

### Phase 8 — Feature parity verification

Exercise every interaction before cutover.

Success criteria:

- settings save/provider switch/Ollama test match current behavior;
- project new/open/delete/reset/autosave match current behavior;
- WebContainer boot, mount, install, logs, preview URL, and hot reload work;
- chat submit/cancel/timeout/stale-result handling works;
- patches apply to files and trigger install when needed;
- editor edits write to WebContainer and mark unsaved;
- terminal input/output and sync work;
- preview element selection and improve-selected flow work;
- ZIP export works.

### Phase 9 — Delete React only after parity

Final cutover.

Tasks:

- switch the default Vite entry to the Gleam/Lustre app;
- remove React components and React-specific dependencies;
- keep JS FFI modules for browser/npm APIs;
- update README/docs.

Success criteria:

- zero React in the production bundle;
- all automated tests pass;
- production build passes;
- browser smoke checklist passes in Chrome;
- bundle size does not regress unexpectedly.

## Testing strategy

### Gleam tests

Use Gleam tests for pure update functions and domain modules.

Coverage targets:

- actor transitions;
- root update cross-domain behavior;
- effect ordering;
- request ID stale result handling;
- save/autosave effect decisions.

### TypeScript/Vitest tests

Keep Vitest for JS externals and integration behavior:

- localStorage external;
- IndexedDB external;
- WebContainer external mocks;
- agent external mocks;
- custom element wrappers;
- Vite build/import compatibility.

### Browser smoke tests

Use browser automation for parity:

- app boots;
- settings save;
- Ollama test status;
- prompt submit/cancel;
- editor change;
- terminal sync;
- project new/open/delete/reset;
- preview element selection;
- ZIP export.

## Major risks

### Lustre + complex third-party widgets

CodeMirror and xterm are React-friendly today. In Lustre they probably need custom elements or imperative externals. This is doable but will be the largest UI interop cost.

Mitigation: build editor/terminal custom elements early as isolated spikes.

### WebContainer lifecycle complexity

WebContainer is singleton-ish and imperative. Gleam should not own that directly.

Mitigation: keep a JS external module with the same semantics as current `src/webcontainer.ts`.

### Type shape duplication

Project files, chat messages, selected elements, and saved projects will need representations in both Gleam and JS.

Mitigation: define the canonical shape once in docs and keep boundary conversion small and tested.

### Build pipeline friction

Vite must consume compiled Gleam JS reliably.

Mitigation: Phase 0 must prove dev and production builds before feature work.

### Rewrite scope

A full Lustre migration is a rewrite of UI behavior, not just a refactor.

Mitigation: keep the current React app until the Lustre app passes parity. Use a feature flag or alternate entry during development.

## Decision checkpoints

After each checkpoint, decide whether to continue, narrow scope, or stop.

1. **After Phase 0:** Is the Gleam/Lustre/Vite build loop acceptable?
2. **After Phase 1:** Is Lustre ergonomic enough for this UI?
3. **After Phase 6:** Are CodeMirror custom-element semantics acceptable?
4. **After Phase 7:** Is xterm/WebContainer interop stable?
5. **After Phase 10:** Is the rewrite better enough to justify cutover?

## Recommended immediate next step

Start with Phase 0 only:

- add Gleam/Lustre dependencies;
- render a minimal Lustre app to a separate root or behind a dev flag;
- prove `gleam build`, `npm test`, and `npm run build` all work.

Do not remove React or TypeScript runtime code until Phase 11.
