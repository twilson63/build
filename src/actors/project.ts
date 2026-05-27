import type { ChatMessage } from '../agent'
import { formatUpdatedAt } from '../projects'
import { starterFiles, upsertFile, type ProjectFile } from '../templates'

export type SavedProjectSnapshot = {
  readonly id: string
  readonly name: string
  readonly updatedAt: string
  readonly files?: readonly ProjectFile[]
  readonly messages?: readonly ChatMessage[]
  readonly selectedPath?: string
}

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

export type ProjectMsg =
  | { type: 'project_loaded'; id: string | null; name: string; files: readonly ProjectFile[]; selectedPath: string; updatedAt?: string }
  | { type: 'project_list_refreshed'; projects: readonly SavedProjectSnapshot[] }
  | { type: 'project_created'; id: string; name: string; files: readonly ProjectFile[]; selectedPath: string }
  | { type: 'project_name_changed'; name: string }
  | { type: 'project_name_editing_toggled' }
  | { type: 'project_name_editing_set'; editing: boolean }
  | { type: 'projects_dialog_toggled' }
  | { type: 'projects_dialog_closed' }
  | { type: 'projects_dialog_opened' }
  | { type: 'project_ready' }
  | { type: 'save_status_changed'; status: string }
  | { type: 'files_updated'; files: readonly ProjectFile[]; status?: string }
  | { type: 'file_applied'; path: string; content: string }
  | { type: 'selected_path_changed'; path: string }
  | { type: 'reset_to_starter' }

export type ProjectEffect =
  | { type: 'load_initial_project' }
  | { type: 'save_current_project'; silent?: boolean; name: string; files: ProjectFile[]; messages: ChatMessage[]; selectedPath: string; currentProjectId: string | null }
  | { type: 'create_project'; name: string; files: ProjectFile[]; messages: ChatMessage[]; selectedPath: string }
  | { type: 'open_project'; id: string }
  | { type: 'delete_project'; id: string }
  | { type: 'refresh_project_list' }
  | { type: 'persist_current_project_id'; id: string | null }
  | { type: 'write_file_to_container'; path: string; content: string }
  | { type: 'remount_project'; files: ProjectFile[] }
  | { type: 'schedule_save'; delay: number }

export function init(): ProjectState {
  return {
    projectName: 'Untitled Project',
    currentProjectId: null,
    savedProjects: [],
    saveStatus: 'Not saved',
    projectReady: false,
    nameEditing: false,
    projectsOpen: false,
    files: starterFiles,
    selectedPath: starterFiles[2].path,
  }
}

export function update(state: ProjectState, msg: ProjectMsg): [ProjectState, ProjectEffect[]] {
  switch (msg.type) {
    case 'project_loaded':
      return [{ ...state, currentProjectId: msg.id, projectName: msg.name, files: msg.files.length ? [...msg.files] : starterFiles, selectedPath: msg.selectedPath || starterFiles[2].path, saveStatus: msg.updatedAt ? `Loaded ${formatUpdatedAt(msg.updatedAt)}` : state.saveStatus }, []]
    case 'project_list_refreshed':
      return [{ ...state, savedProjects: [...msg.projects] }, []]
    case 'project_created':
      return [{ ...state, currentProjectId: msg.id, projectName: msg.name, files: [...msg.files], selectedPath: msg.selectedPath, saveStatus: 'Saved just now' }, []]
    case 'project_name_changed':
      return [{ ...state, projectName: msg.name }, []]
    case 'project_name_editing_toggled':
      return [{ ...state, nameEditing: !state.nameEditing }, []]
    case 'project_name_editing_set':
      return [{ ...state, nameEditing: msg.editing }, []]
    case 'projects_dialog_toggled':
      return [{ ...state, projectsOpen: !state.projectsOpen }, []]
    case 'projects_dialog_opened':
      return [{ ...state, projectsOpen: true }, [{ type: 'refresh_project_list' }]]
    case 'projects_dialog_closed':
      return [{ ...state, projectsOpen: false }, []]
    case 'project_ready':
      return [{ ...state, projectReady: true }, []]
    case 'save_status_changed':
      return [{ ...state, saveStatus: msg.status }, []]
    case 'files_updated':
      return [{ ...state, files: [...msg.files], saveStatus: msg.status ?? state.saveStatus }, []]
    case 'file_applied':
      return [{ ...state, files: upsertFile([...state.files], msg.path, msg.content), saveStatus: 'Unsaved changes' }, [{ type: 'write_file_to_container', path: msg.path, content: msg.content }]]
    case 'selected_path_changed':
      return [{ ...state, selectedPath: msg.path }, []]
    case 'reset_to_starter':
      return [{ ...state, files: starterFiles, selectedPath: starterFiles[2].path, saveStatus: 'Unsaved changes' }, [{ type: 'remount_project', files: starterFiles }]]
    default: {
      const _exhaustive: never = msg
      return [state, []]
    }
  }
}
