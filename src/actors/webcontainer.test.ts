import { describe, expect, it } from 'vitest'
import { starterFiles } from '../templates'
import { init, isBusy, update } from './webcontainer'

describe('webcontainer actor', () => {
  it('starts loading and becomes ready on boot success', () => {
    expect(isBusy(init())).toBe(true)
    const [booting] = update(init(), { type: 'boot_started' })
    expect(booting.bootPhase.phase).toBe('booting_container')
    const [ready] = update(booting, { type: 'boot_succeeded' })
    expect(ready.bootPhase.phase).toBe('ready')
    expect(ready.hydrated).toBe(true)
  })

  it('caps logs to prior 200 plus newest line', () => {
    let state = init()
    for (let i = 0; i < 205; i++) [state] = update(state, { type: 'log_appended', line: String(i) })
    expect(state.logs).toHaveLength(201)
    expect(state.logs[0]).toBe('4')
    expect(state.logs.at(-1)).toBe('204')
  })

  it('remounts with autosave suppression and emits mount effect', () => {
    const [remounting, effects] = update(init(), { type: 'remount_requested', files: starterFiles })
    expect(remounting.bootPhase.phase).toBe('remounting')
    expect(remounting.suppressAutoSave).toBe(true)
    expect(effects).toEqual([{ type: 'mount_and_install', files: starterFiles }])
    const [finished] = update(remounting, { type: 'remount_finished' })
    expect(finished.bootPhase.phase).toBe('ready')
    expect(finished.suppressAutoSave).toBe(false)
  })
})
