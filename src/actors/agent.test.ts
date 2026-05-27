import { describe, expect, it } from 'vitest'
import { init, isRunning, update } from './agent'

describe('agent actor', () => {
  it('transitions idle to running and ticks with injected time', () => {
    const [running, effects] = update(init(), { type: 'agent_request_started', requestId: 'r1', startedAt: 1000 })
    expect(isRunning(running)).toBe(true)
    expect(effects).toEqual([{ type: 'start_elapsed_timer' }])
    const [ticked] = update(running, { type: 'agent_elapsed_tick', now: 3750 })
    expect(ticked.elapsedSeconds).toBe(2)
  })

  it('success and failure ignore stale request ids', () => {
    const [running] = update(init(), { type: 'agent_request_started', requestId: 'r1', startedAt: 0 })
    const [stale] = update(running, { type: 'agent_request_succeeded', requestId: 'old', reply: 'bad', patches: [] })
    expect(stale).toBe(running)
    const [done, effects] = update(running, { type: 'agent_request_succeeded', requestId: 'r1', reply: 'ok', patches: [{ path: 'package.json', content: '{}' }] })
    expect(done.lifecycle.status).toBe('idle')
    expect(effects).toEqual([{ type: 'stop_elapsed_timer' }, { type: 'install_if_needed', patches: [{ path: 'package.json', content: '{}' }] }])
  })

  it('cancel and timeout stop timer and abort', () => {
    const [running] = update(init(), { type: 'agent_request_started', requestId: 'r1', startedAt: 0 })
    expect(update(running, { type: 'agent_request_canceled' })[1]).toEqual([{ type: 'stop_elapsed_timer' }, { type: 'abort_agent' }])
    const [timedOut, effects] = update(running, { type: 'agent_timeout_reached', requestId: 'r1' })
    expect(timedOut.lifecycle.status).toBe('timed_out')
    expect(effects).toEqual([{ type: 'stop_elapsed_timer' }, { type: 'abort_agent' }])
  })
})
