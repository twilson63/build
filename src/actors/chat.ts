import type { ChatMessage } from '../agent'

export type ChatState = {
  readonly messages: readonly ChatMessage[]
  readonly prompt: string
  readonly expandedMessages: ReadonlySet<number>
}

export type ChatMsg =
  | { type: 'user_sent_message'; content: string }
  | { type: 'assistant_replied'; content: string }
  | { type: 'assistant_error'; message: string }
  | { type: 'prompt_changed'; value: string }
  | { type: 'message_toggled'; index: number }
  | { type: 'messages_replaced'; messages: readonly ChatMessage[] }
  | { type: 'chat_cleared' }

export type ChatEffect = never

export function init(): ChatState {
  return { messages: [], prompt: '', expandedMessages: new Set() }
}

export function update(state: ChatState, msg: ChatMsg): [ChatState, ChatEffect[]] {
  switch (msg.type) {
    case 'user_sent_message':
      return [{ ...state, messages: [...state.messages, { role: 'user', content: msg.content }], prompt: '' }, []]
    case 'assistant_replied':
      return [{ ...state, messages: [...state.messages, { role: 'assistant', content: msg.content }] }, []]
    case 'assistant_error':
      return [{ ...state, messages: [...state.messages, { role: 'assistant', content: `Error: ${msg.message}` }] }, []]
    case 'prompt_changed':
      return [{ ...state, prompt: msg.value }, []]
    case 'message_toggled': {
      const next = new Set(state.expandedMessages)
      if (next.has(msg.index)) next.delete(msg.index)
      else next.add(msg.index)
      return [{ ...state, expandedMessages: next }, []]
    }
    case 'messages_replaced':
      return [{ ...state, messages: [...msg.messages], expandedMessages: new Set() }, []]
    case 'chat_cleared':
      return [{ ...state, messages: [], expandedMessages: new Set() }, []]
    default: {
      const _exhaustive: never = msg
      return [state, []]
    }
  }
}
