import type { ProjectFile } from '../templates'

export type BootPhase =
  | { readonly phase: 'loading_indexeddb' }
  | { readonly phase: 'booting_container' }
  | { readonly phase: 'installing' }
  | { readonly phase: 'starting_dev_server' }
  | { readonly phase: 'remounting' }
  | { readonly phase: 'ready' }
  | { readonly phase: 'error'; readonly message: string }

export type WebContainerState = {
  readonly bootPhase: BootPhase
  readonly hydrated: boolean
  readonly suppressAutoSave: boolean
  readonly logs: readonly string[]
}

export type WebContainerMsg =
  | { type: 'boot_started' }
  | { type: 'boot_succeeded' }
  | { type: 'boot_failed'; message: string }
  | { type: 'phase_changed'; phase: BootPhase }
  | { type: 'log_appended'; line: string }
  | { type: 'project_hydrated' }
  | { type: 'suppress_autosave_changed'; suppress: boolean }
  | { type: 'remount_requested'; files: readonly ProjectFile[] }
  | { type: 'remount_finished' }
  | { type: 'sync_files_requested' }

export type WebContainerEffect =
  | { type: 'boot_container'; files: ProjectFile[] }
  | { type: 'mount_and_install'; files: ProjectFile[] }
  | { type: 'start_dev_server' }
  | { type: 'run_npm_install' }
  | { type: 'read_files_from_container' }

export function init(): WebContainerState {
  return { bootPhase: { phase: 'loading_indexeddb' }, hydrated: false, suppressAutoSave: false, logs: [] }
}

function appendLog(logs: readonly string[], line: string): readonly string[] {
  return [...logs.slice(-200), line]
}

export function isBusy(state: WebContainerState): boolean {
  return state.bootPhase.phase !== 'ready'
}

export function update(state: WebContainerState, msg: WebContainerMsg): [WebContainerState, WebContainerEffect[]] {
  switch (msg.type) {
    case 'boot_started':
      return [{ ...state, bootPhase: { phase: 'booting_container' } }, []]
    case 'boot_succeeded':
      return [{ ...state, bootPhase: { phase: 'ready' }, hydrated: true }, []]
    case 'boot_failed':
      return [{ ...state, bootPhase: { phase: 'error', message: msg.message }, logs: appendLog(state.logs, msg.message) }, []]
    case 'phase_changed':
      return [{ ...state, bootPhase: msg.phase }, []]
    case 'log_appended':
      return [{ ...state, logs: appendLog(state.logs, msg.line) }, []]
    case 'project_hydrated':
      return [{ ...state, hydrated: true }, []]
    case 'suppress_autosave_changed':
      return [{ ...state, suppressAutoSave: msg.suppress }, []]
    case 'remount_requested':
      return [{ ...state, bootPhase: { phase: 'remounting' }, suppressAutoSave: true }, [{ type: 'mount_and_install', files: [...msg.files] }]]
    case 'remount_finished':
      return [{ ...state, bootPhase: { phase: 'ready' }, suppressAutoSave: false }, []]
    case 'sync_files_requested':
      return [state, [{ type: 'read_files_from_container' }]]
    default: {
      const _exhaustive: never = msg
      return [state, []]
    }
  }
}
