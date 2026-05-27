import { describe, expect, it } from 'vitest'
import { starterFiles } from '../templates'
import { init, update } from './project'

describe('project actor', () => {
  it('initializes starter files and selected path', () => {
    expect(init()).toMatchObject({ projectName: 'Untitled Project', currentProjectId: null, saveStatus: 'Not saved', selectedPath: starterFiles[2].path })
    expect(init().files).toEqual(starterFiles)
  })

  it('loads a project and falls back to starter files when empty', () => {
    const [loaded] = update(init(), { type: 'project_loaded', id: 'p1', name: 'Name', files: [], selectedPath: '', updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(loaded.currentProjectId).toBe('p1')
    expect(loaded.files).toEqual(starterFiles)
    expect(loaded.selectedPath).toBe(starterFiles[2].path)
    expect(loaded.saveStatus).toContain('Loaded')
  })

  it('applies files via upsert semantics and emits write effect', () => {
    const [next, effects] = update(init(), { type: 'file_applied', path: '/src/App.tsx', content: 'new' })
    expect(next.files.find(file => file.path === 'src/App.tsx')?.content).toBe('new')
    expect(next.saveStatus).toBe('Unsaved changes')
    expect(effects).toEqual([{ type: 'write_file_to_container', path: '/src/App.tsx', content: 'new' }])
  })

  it('opens dialogs, changes name, resets to starter', () => {
    const [open, openEffects] = update(init(), { type: 'projects_dialog_opened' })
    expect(open.projectsOpen).toBe(true)
    expect(openEffects).toEqual([{ type: 'refresh_project_list' }])
    const [renamed] = update(open, { type: 'project_name_changed', name: 'CRM' })
    expect(renamed.projectName).toBe('CRM')
    const [reset, effects] = update(renamed, { type: 'reset_to_starter' })
    expect(reset.files).toEqual(starterFiles)
    expect(effects).toEqual([{ type: 'remount_project', files: starterFiles }])
  })
})
