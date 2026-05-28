import { dispatchNewProjectConfirmed, dispatchRemoveProjectConfirmed } from './runtime_bridge.mjs'

export function confirmNewProject() {
  if (globalThis.confirm?.('Start a new project? Unsaved changes are auto-saved first.') !== false) {
    void dispatchNewProjectConfirmed()
  }
}

export function confirmRemoveProject(id) {
  if (globalThis.confirm?.('Delete this project? This cannot be undone.') === true) {
    void dispatchRemoveProjectConfirmed(id)
  }
}
