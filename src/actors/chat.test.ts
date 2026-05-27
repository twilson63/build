import { describe, expect, it } from 'vitest'
import { init, update } from './chat'

describe('chat actor', () => {
  it('appends user messages and clears prompt', () => {
    const [next] = update({ ...init(), prompt: 'hello' }, { type: 'user_sent_message', content: 'hello' })
    expect(next.prompt).toBe('')
    expect(next.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('appends assistant replies and errors', () => {
    const [withReply] = update(init(), { type: 'assistant_replied', content: 'ok' })
    expect(withReply.messages).toEqual([{ role: 'assistant', content: 'ok' }])
    const [withError] = update(withReply, { type: 'assistant_error', message: 'bad' })
    expect(withError.messages.at(-1)).toEqual({ role: 'assistant', content: 'Error: bad' })
  })

  it('toggles expanded messages and clears them with chat', () => {
    const [expanded] = update(init(), { type: 'message_toggled', index: 2 })
    expect(expanded.expandedMessages.has(2)).toBe(true)
    const [collapsed] = update(expanded, { type: 'message_toggled', index: 2 })
    expect(collapsed.expandedMessages.has(2)).toBe(false)
    const [cleared] = update(expanded, { type: 'chat_cleared' })
    expect(cleared.messages).toEqual([])
    expect(cleared.expandedMessages.size).toBe(0)
  })
})
