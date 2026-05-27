# Build: Migrating from React to Gleam

## An Architecture Migration Plan

### The Premise

The Build project is a browser-based application builder. It runs React, TypeScript, Vite, WebContainers, CodeMirror, and xterm.js — a 545-line monolithic `main.tsx` with 19 `useState` hooks holding it all together. The code works. All 42 tests pass. But the architecture has a ceiling problem: every new feature tangles more state into the same component, and the lack of structural boundaries means the only direction is inward, toward complexity.

This plan proposes migrating Build from React to Gleam — a statically typed functional language that compiles to JavaScript, paired with Lustre, its web framework built on the Model-View-Update architecture. The goal is not to change what Build does. The goal is to change how Build is built.

Open the React version and the Gleam version side by side. You should not be able to tell the difference. Same CSS. Same layout. Same interactions. Same timing. This is an architecture upgrade, not a rewrite.

---

### Why Gleam

Three reasons, specific to this project.

First, Build's complexity is about to scale. The current feature set — agent chat, file editing, terminal, preview inspection, project CRUD — is just the foundation. The two-tier agent architecture (Brain sending structured instructions, Hands executing in a sandbox) means state management will get more complex, not less. Gleam's type system catches entire categories of bugs at compile time. The compiler enforces that every message variant is handled. The compiler enforces that state transitions are exhaustive. The compiler enforces that impossible states are impossible. When agents are writing most of the code, this enforcement is not a nice-to-have — it is the difference between a codebase that degrades and a codebase that improves.

Second, the Gleam/Lustre architecture mirrors how Build actually works. The current React app has six implicit domains: settings, project management, chat, agent lifecycle, preview, and WebContainer operations. These domains interact in predictable ways — settings flow into agent calls, project changes trigger container remounts, agent results update files. In Gleam, each domain becomes an explicit actor module with its own state, messages, and effects. The interactions between domains flow through typed messages, not through shared `useState` hooks and closure-captured values. The architecture matches the mental model.

Third, Gleam supports a pluggable extension system natively. Lustre's component model is built on Web Components with typed attributes and events. Each `<build-*>` custom element is a self-contained module that can be developed, tested, and swapped independently. This is the same pattern CodeMirror uses for its extension system — compartments where extensions provide typed values — but enforced at the language level. Want to add a diff view? Add a `<build-diff-view>` component. Want to add deployment? Add a `<build-deploy>` component. The core app does not need to change.

---

### The Architecture

The migration replaces one 545-line React component with six domain actors and a Lustre application shell.

Each actor is a self-contained Gleam module with three parts: a `Model` type representing its state, a `Msg` type representing all the ways the outside world can affect that state, and an `update` function that takes the current state and a message and returns the next state plus a list of effects. The `update` function is pure. It performs no side effects. Side effects — API calls, IndexedDB writes, WebContainer operations — are represented as typed `Effect` values that the runtime interprets after the update completes.

The six actors are:

**Settings** owns the LLM provider configuration — provider type, API key, Ollama URL, model name, and the settings modal state. It persists changes to localStorage and tests Ollama connectivity.

**Project** owns the project CRUD lifecycle — project name, current project ID, saved projects list, save status, files, and selected path. It hydrates from IndexedDB on boot, auto-saves with a 900ms debounce, and triggers container remounts when projects change.

**Chat** owns the message history and prompt input. It is the simplest actor — it manages messages, expanded states, and the prompt text. It has no effects; it only manages UI state.

**Agent** owns the agent call lifecycle — busy state, elapsed time, and abort management. It replaces the two near-identical `submit()` and `improveSelectedElement()` functions with a single `call_agent` effect parameterized by whether a selected element is included. The agent lifecycle is modeled as a state machine: idle, running, and canceled.

**Preview** owns the preview iframe URL, element selection mode, and the selected element state. It manages the postMessage bridge to the preview iframe's build-inspector.

**WebContainer** owns the boot lifecycle — booting, hydrated, and running states. It manages logs, the dev server URL, and file sync between the container and the app state.

The app-level `app.gleam` composes all six actors. It defines a union `AppMsg` type that wraps each domain's messages, and an `appUpdate` function that routes messages to the correct actor and composes the resulting state and effects.

---

### The Effect Runtime

The effect runtime is the bridge between pure state transitions and the real world. When an actor's `update` function returns an effect, the runtime interprets it and dispatches new messages back into the update loop.

For example, when the user submits a prompt, the chat actor adds a user message to the history and the agent actor receives an `agent_request_started` message. The agent's update function returns a `call_agent` effect. The runtime calls the `runAgent` FFI binding with the prompt, provider settings, and project files. When the LLM responds, the runtime dispatches an `agent_request_succeeded` message with the reply and patches. The app update function applies the patches to the project's file list and, if `package.json` changed, dispatches a `run_npm_install` effect.

Every side effect in the current React app maps to a typed effect in this system. The runtime is the only place where impure operations happen. The actor modules are testable without mocking React, without a DOM, without any infrastructure — just call `update(state, msg)` and assert on the returned state and effects.

---

### Component Interop: CodeMirror and xterm

The two most complex FFI bindings are CodeMirror and xterm.js. Both are vanilla JavaScript libraries that need imperative lifecycle management — exactly what Lustre custom elements are designed for.

**CodeMirror 6** is currently wrapped by `@uiw/react-codemirror`, a 31-line React component. In the Gleam version, we drop the React wrapper and use vanilla CodeMirror 6 directly inside a Lustre custom element called `<build-editor>`. The element receives `path` and `value` as properties, dispatches a custom `change` event when the user edits, and manages the CodeMirror instance lifecycle internally. The Gleam FFI binding is a small JavaScript module that creates the editor view, applies language extensions based on the file path, and wires the `onChange` callback to dispatch the custom event.

**xterm.js** is already framework-agnostic. The current `TerminalPanel.tsx` barely uses React — it uses `useRef` for the host div, `useEffect` for lifecycle, and `useEffect` for log streaming. In Gleam, it becomes a `<build-terminal>` custom element that receives `logs` and `enabled` as properties. The element creates the Terminal instance in `connectedCallback`, connects the shell when enabled, and streams log chunks by writing to the terminal. The Gleam side defines the custom element registration and the property interfaces.

Both custom elements use light DOM — not shadow DOM — so the existing `styles.css` works verbatim. The CSS class selectors match the real DOM elements inside the custom elements. No style duplication, no `::part()` selectors, no shadow DOM piercing needed.

---

### The Plugin System

The Gleam architecture supports a pluggable extension model inspired by CodeMirror's compartment system. Each feature is a Lustre custom element that registers with the browser and communicates with the app shell through typed attributes and events.

The core plugins are the six described above: `<build-editor>`, `<build-terminal>`, `<build-preview>`, `<build-agent-chat>`, `<build-project-nav>`, and `<build-element-picker>`. Each is independently developable and testable. Each has its own internal state that the parent app cannot touch. Each communicates through a typed interface — attributes in, events out.

Adding a new feature means adding a new `<build-*>` component. The core app shell does not need to change — it just renders the new element in the right place and wires the attributes and events. This is how Build scales: by adding modules, not by extending a monolith.

Future plugins could include a diff view, a deployment manager, a performance profiler, a theme customizer, or a collaborative editing component. Each would be a self-contained Gleam module with its own Lustre component, its own state, and its own typed interface to the app.

---

### Migration Phases

The migration proceeds in nine phases, each with a verification gate that must pass before proceeding.

**Phase 0: Set up the Gleam project.** Initialize a Gleam project targeting JavaScript. Add Lustre as a dependency. Get a "Hello world" app compiling to a JS bundle and rendering in the browser. Gate: the Gleam app renders "Hello from Build" at `http://localhost:1234`.

**Phase 1: Port pure modules.** The four modules that contain no side effects — `templates.ts`, `preview-inspector.ts`, `design-guidance.ts`, and `editor.ts` — are rewritten as native Gleam modules. These are pure functions operating on pure data types. No FFI needed. Gate: Gleam unit tests pass for all four modules, matching the behavior of the TypeScript originals.

**Phase 2: Build the actor system — simple actors first.** Implement the Settings, Chat, and Preview actors. These have the fewest dependencies and the simplest effect sets. Write unit tests for each actor's `update` function. Gate: all actor unit tests pass. Settings persists to localStorage. Chat adds and toggles messages. Preview manages element selection state.

**Phase 3: Build the Agent and WebContainer actors.** These are the complex actors. The Agent actor implements the lifecycle state machine (idle, running, canceled) and the unified `call_agent` effect. The WebContainer actor implements the boot phase state machine (booting, hydrated, running) and the container effects. Gate: agent unit tests pass. Agent cancels correctly. WebContainer boot sequence completes.

**Phase 4: Build the effect runtime.** Implement the effect interpreter that maps each typed effect to its real-world operation. This is where the FFI bindings for `runAgent`, IndexedDB, WebContainer, and postMessage live. Gate: the runtime correctly interprets all effect types. Integration tests pass for settings persistence, project CRUD, and agent calls.

**Phase 5: Build Lustre components.** Implement the `<build-editor>` and `<build-terminal>` custom elements with their FFI bindings. Implement the view components for chat, project nav, preview, and element picker. Gate: each component renders correctly in isolation. The editor shows a CodeMirror instance. The terminal shows an xterm instance. The chat panel shows messages.

**Phase 6: Wire the app shell.** Compose all actors and components into the `app.gleam` shell. Copy `styles.css` verbatim. Render the full layout — sidebar, editor, preview, terminal. Gate: the Gleam app renders the same DOM structure as the React app. Visual inspection shows the same layout.

**Phase 7: Visual parity verification.** Run both apps side by side. Take screenshots. Compare every pixel. Fix any CSS class mismatches, layout differences, or rendering artifacts. Gate: screenshot comparison shows zero differences in layout, spacing, colors, and typography.

**Phase 8: Feature parity verification.** Test every interaction: submit a prompt, edit a file, open a project, create a new project, delete a project, select a preview element, improve an element, toggle settings, test Ollama connection, cancel an agent request, download a ZIP, wait for auto-save, resize the terminal. Gate: every interaction in the React app works identically in the Gleam app.

**Phase 9: Delete React.** Remove the `src/` TypeScript directory, `package.json` React dependencies, and `vite.config.ts`. The Gleam build output becomes the sole JS bundle. Keep the pure JS FFI modules (`ffi/agent.js`, `ffi/projects.js`, `ffi/webcontainer.js`, `ffi/zip.js`, `ffi/codemirror.js`, `ffi/xterm.js`). Gate: the Gleam app deploys to the same URL with the same functionality. The React source is gone.

---

### What Stays, What Goes

The CSS stays. `styles.css` is copied verbatim into the Gleam project. Lustre renders real DOM with real class names. The CSS selectors still match.

The pure data modules go — rewritten as native Gleam. `templates.ts`, `preview-inspector.ts`, `design-guidance.ts`, and `editor.ts` become Gleam modules with the same logic, but with the type system enforcing correctness.

The impure modules stay as JavaScript FFI bindings. `agent.ts`, `projects.ts`, `webcontainer.ts`, and `zip.ts` remain as JavaScript files called from Gleam through FFI. They are the bridge between the pure Gleam world and the impure JavaScript world.

The React components go. `main.tsx`, `CodeEditor.tsx`, and `TerminalPanel.tsx` are deleted. Their logic moves into Gleam actors and Lustre components. The CodeMirror and xterm integrations move from React wrappers to Lustre custom elements.

The test suite transitions. The 42 TypeScript tests are replaced with Gleam unit tests for the actor `update` functions — which are pure functions that need no DOM, no React, no mocking. Integration tests for the FFI bindings verify the runtime behavior.

---

### Risks

**Lustre maturity.** Lustre is at version 5.6, actively developed, but largely a one-person project. Mitigation: the architecture is simple enough that if Lustre has issues, the custom element layer can be replaced with direct DOM manipulation without changing the actor system.

**FFI complexity.** The WebContainer API, CodeMirror, and xterm.js are complex JavaScript libraries. FFI bindings require careful interface design. Mitigation: the FFI layer is thin — each binding is a small JavaScript module that exposes a simple interface to Gleam. The complex logic stays in JavaScript where the libraries are designed to work.

**Development tooling.** Gleam's `lustre_dev_tools` provides a dev server with hot reloading, but it is not as mature as Vite's HMR. Mitigation: for development, use `lustre_dev_tools`. For production builds, use `gleam build` and serve the output with the same static server that currently serves the React build.

**xterm streaming performance.** xterm.js receives high-frequency log chunks from WebContainer. If log dispatches go through Lustre's event system, there may be latency. Mitigation: the `<build-terminal>` custom element manages log rendering internally, bypassing the Lustre event loop for streaming writes. Only the `enabled` flag and shell connection go through Lustre attributes.

**CSS parity.** Shadow DOM would break the existing CSS. Mitigation: use light DOM for all Build custom elements. Lustre supports this through its slot system without attaching a shadow root.

---

### The Bottom Line

The Gleam migration is a bet on architecture over convenience. React is convenient — it is the industry default, the ecosystem is massive, and any developer can contribute. But React's hooks model does not enforce boundaries. It allows — even encourages — the kind of state entanglement that makes Build's `main.tsx` a 545-line monolith.

Gleam enforces boundaries at the type level. The compiler prevents unhandled message variants. The compiler prevents access to another actor's state. The compiler prevents side effects in the update loop. These are not conventions — they are compile-time guarantees.

For a project where AI agents will be writing most of the code, these guarantees are the difference between a codebase that degrades with every feature and a codebase that stays clean as it grows. The Gleam migration is an investment in the architecture that will carry Build forward.

Same URL. Same experience. Better foundation.