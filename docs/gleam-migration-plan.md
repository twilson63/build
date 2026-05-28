# Gleam Language Migration Plan

Branch: `feat/gleam`

## Goal

Experimentally migrate the existing TypeScript actor architecture to the actual Gleam language, while keeping the browser React UI and impure runtime integrations in TypeScript.

This is a language migration for the pure state-machine layer, not a BEAM runtime migration. Gleam should compile to JavaScript and be imported by the existing TypeScript store/runtime boundary.

## Guiding constraints

- Keep `src/App.tsx`, WebContainer integration, IndexedDB, DOM refs, timers, and `runAgent()` orchestration in TypeScript.
- Move only pure actor logic to Gleam first.
- Preserve current behavior and tests throughout.
- Port actors incrementally behind stable TypeScript adapter modules, so the rest of the app does not need a large rewrite.
- Do not migrate all actors at once. Start with the smallest, no-effect actor.

## Proposed final shape

```text
gleam.toml
src_gleam/
  build_actors/
    chat.gleam
    preview.gleam
    settings.gleam
    agent.gleam
    project.gleam
    webcontainer.gleam
src/actors/
  chat.ts          # TS adapter around compiled Gleam module
  preview.ts       # TS adapter around compiled Gleam module
  ...
build/dev/javascript/build_actors/...
```

TypeScript remains the public app boundary:

```text
React UI → src/store.ts → src/actors/*.ts adapters → compiled Gleam JS
                                      ↓
                            [nextState, effects]
                                      ↓
                              src/runtime/*.ts
```

## Key technical approach

### 1. Add Gleam JavaScript target

Create a Gleam project configured for JavaScript output. Use a separate source directory so it does not conflict with the existing TypeScript `src/` tree.

Expected config direction:

```toml
# gleam.toml
name = "build_actors"
target = "javascript"
src = "src_gleam"
```

If Gleam's config does not support the exact `src` key as expected, use the standard `src/` Gleam layout and move TypeScript into a compatible structure only if necessary. Prefer avoiding that churn.

### 2. Compile before TypeScript build/test

Add npm scripts that compile Gleam before TypeScript/Vite:

```json
{
  "scripts": {
    "gleam:build": "gleam build",
    "gleam:test": "gleam test",
    "test": "npm run gleam:build && vitest run",
    "build": "npm run gleam:build && tsc -b && vite build"
  }
}
```

For the first experiment, `gleam test` may be added once Gleam test files exist.

### 3. Keep TypeScript adapters as compatibility layer

Do not make `src/store.ts` import compiled Gleam directly at first. Instead, keep `src/actors/chat.ts` exporting the same TypeScript API:

```ts
export type ChatState = ...
export type ChatMsg = ...
export type ChatEffect = never
export function init(): ChatState
export function update(state: ChatState, msg: ChatMsg): [ChatState, ChatEffect[]]
```

Internally, that adapter can translate TS discriminated unions to a Gleam-friendly encoded representation, call compiled Gleam JS, and translate the result back.

This preserves existing store tests and lets one actor migrate at a time.

## Migration order

### Phase 0 — Toolchain spike

Add Gleam JavaScript compilation without changing app behavior.

Success criteria:

- `gleam build` succeeds.
- `npm test` still passes.
- `npm run build` still passes.
- No app actor imports have changed yet.

### Phase 1 — Port Chat actor

Why first: `chat` has no effects and uses simple state transitions. It is the lowest-risk proof of interop.

Tasks:

1. Implement `chat.gleam` with state, messages, and `update`.
2. Keep `src/actors/chat.ts` as the TypeScript adapter.
3. Preserve current `ChatState`/`ChatMsg` TypeScript exports.
4. Add Gleam unit tests for chat behavior.
5. Keep existing `src/actors/chat.test.ts` passing unchanged.

Success criteria:

- `src/actors/chat.ts` delegates update/init logic to compiled Gleam JS.
- Existing chat tests pass unchanged.
- New Gleam chat tests pass.
- Full `npm test` and `npm run build` pass.

### Phase 2 — Port Preview actor

Why second: small actor with one effect union and nullable selected element.

Tasks:

1. Implement `preview.gleam`.
2. Decide how to encode `SelectedPreviewElement` across the boundary. Prefer treating it as an opaque external value in Gleam if possible; otherwise define a matching Gleam record.
3. Preserve `PreviewEffect` TypeScript shape exactly.
4. Keep `src/actors/preview.test.ts` passing unchanged.

Success criteria:

- Selecting toggles produce exact `BUILD_INSPECTOR_ENABLE` / `BUILD_INSPECTOR_DISABLE` effects.
- Element selection clears comment and disables selecting.
- Existing preview tests pass unchanged.
- Full validation passes.

### Phase 3 — Port Agent lifecycle actor

Why third: important state machine, but still independent from browser APIs if abort controllers remain in TypeScript runtime.

Tasks:

1. Implement `agent.gleam` lifecycle state machine.
2. Preserve request ID stale-result behavior.
3. Preserve TypeScript adapter types for `AgentState`, `AgentMsg`, `AgentEffect`.
4. Keep `AbortController`, timeout, and timers in `src/runtime/index.ts`.

Success criteria:

- Idle/running/timed-out transitions match current TypeScript actor.
- Stale request IDs are ignored.
- Cancel/timeout effects are identical.
- Existing agent actor tests pass unchanged.

### Phase 4 — Port Settings actor

Why fourth: simple state, but localStorage initialization should remain TypeScript-owned or passed into Gleam as data.

Tasks:

1. Keep browser localStorage reads in the TypeScript adapter.
2. Implement pure setting transitions in `settings.gleam`.
3. Keep `persistEffect` shape stable.

Success criteria:

- Provider/model default behavior matches current tests.
- Settings init defaults remain unchanged.
- Persistence effect is still interpreted by TypeScript runtime.

### Phase 5 — Port Project actor

Why later: richer nested records and arrays of project files/messages.

Tasks:

1. Define Gleam record types for project state, file snapshots, and saved project snapshots, or encode external values carefully.
2. Preserve `upsertFile` semantics. Either port the pure logic to Gleam or keep it as TypeScript helper called by the adapter.
3. Preserve exact save-status strings.

Success criteria:

- Starter-file initialization and selected path behavior unchanged.
- File application uses the same normalization/order semantics as current `upsertFile`.
- Existing project actor tests pass unchanged.
- Store integration tests pass unchanged.

### Phase 6 — Port WebContainer actor

Why last: the state is pure, but it models impure lifecycle semantics and is easy to confuse with runtime responsibilities.

Tasks:

1. Port `BootPhase`, log capping, hydration, and autosave suppression transitions.
2. Keep all WebContainer API calls in TypeScript runtime.
3. Preserve busy derivation semantics.

Success criteria:

- Boot/remount phases unchanged.
- Log capping unchanged.
- Existing WebContainer actor tests pass unchanged.

### Phase 7 — Optional app-level update exploration

Only after all domain actors are stable, consider whether `appUpdate()` itself should move to Gleam.

This is optional and higher risk because it composes all domain state, cross-domain effects, and TypeScript-specific app messages.

Success criteria if attempted:

- `src/store.ts` remains the React external-store implementation.
- Gleam owns only pure `appUpdate` composition.
- Runtime effects and subscriptions remain TypeScript.
- All store integration tests pass unchanged or with minimal adapter-only changes.

## Interop risks

### TypeScript type loss from compiled Gleam JS

Compiled Gleam JS may not provide TypeScript declarations. Mitigation: keep hand-written TypeScript adapter types and treat compiled Gleam imports as implementation details.

### Data encoding overhead

Gleam custom types may compile to JS structures that are awkward to construct directly. Mitigation: adapters isolate conversion. For early actors, use string-tagged objects that are easy to map.

### Nullable values

Gleam uses `Option`, TypeScript uses `null`/`undefined`. Mitigation: adapters convert `null` to `None` and `Some(value)` back to the expected TypeScript shape.

### Sets

`ChatState.expandedMessages` currently uses `ReadonlySet<number>`. Gleam does not map directly to JS `Set` in the same way. Mitigation options:

1. Store expanded message indices as `List(Int)` in Gleam and convert to/from `Set` in adapter.
2. Change TypeScript `ChatState` to use `readonly number[]` if tests and UI remain simple.

Prefer option 1 for minimal external behavior change.

### Runtime boundary creep

Avoid moving fetch, timers, AbortController, IndexedDB, WebContainer, or DOM refs to Gleam in early phases. The benefit is in pure transition safety, not browser interop.

## Validation commands

Run after every phase:

```bash
gleam build
npm test -- --reporter=dot
npm run build
```

Once Gleam tests exist:

```bash
gleam test
```

## Recommended first implementation PR

Scope the first PR to Phases 0 and 1 only:

- Add Gleam JS toolchain.
- Port `chat` actor only.
- Keep TypeScript adapter API unchanged.
- Add Gleam chat tests.
- Keep all current app tests and build passing.

This proves the value and cost of real Gleam interop before committing to the harder actors.
