import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAgent, type ChatMessage } from './agent'

const originalFetch = globalThis.fetch

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
})

describe('runAgent', () => {
  it('calls Ollama with project context and parses JSON patches', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: { content: JSON.stringify({
        reply: 'Updated locally.',
        patches: [{ path: 'src/main.tsx', content: 'export {}' }],
      }) },
    }), { status: 200 }))
    globalThis.fetch = fetchMock as typeof fetch

    const result = await runAgent({
      provider: 'ollama',
      ollamaUrl: 'http://localhost:11434/',
      model: 'glm-5:cloud',
      userPrompt: 'change title',
      messages: [{ role: 'assistant', content: 'Previous reply' }] satisfies ChatMessage[],
      files: [{ path: 'src/main.tsx', content: '<App />' }],
    })

    expect(result).toEqual({
      reply: 'Updated locally.',
      patches: [{ path: 'src/main.tsx', content: 'export {}' }],
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/api/chat')
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'glm-5:cloud', stream: false, format: 'json' })
    expect(String(init.body)).toContain('src/main.tsx')
    expect(String(init.body)).toContain('change title')
  })

  it('calls OpenRouter with API key and response_format JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"ok","patches":[]}' } }],
    }), { status: 200 }))
    globalThis.fetch = fetchMock as typeof fetch

    await expect(runAgent({ provider: 'openrouter', apiKey: 'sk-test', model: 'test/model', userPrompt: 'noop', messages: [], files: [] }))
      .resolves.toEqual({ reply: 'ok', patches: [] })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers).toMatchObject({ authorization: 'Bearer sk-test' })
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'test/model', response_format: { type: 'json_object' } })
  })

  it('accepts JSON wrapped in a markdown code block', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      message: { content: '```json\n{"reply":"ok","patches":[]}\n```' },
    }), { status: 200 })) as typeof fetch

    await expect(runAgent({ provider: 'ollama', model: 'model', userPrompt: 'noop', messages: [], files: [] }))
      .resolves.toEqual({ reply: 'ok', patches: [] })
  })

  it('extracts JSON from model prose when possible', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      message: { content: 'Here is the update:\n{"reply":"ok","patches":[]}\nDone.' },
    }), { status: 200 })) as typeof fetch

    await expect(runAgent({ provider: 'ollama', model: 'model', userPrompt: 'noop', messages: [], files: [] }))
      .resolves.toEqual({ reply: 'ok', patches: [] })
  })

  it('repairs invalid non-JSON model responses with one follow-up request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: { content: "Here's what I changed: not JSON" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: { content: '{"reply":"repaired","patches":[]}' },
      }), { status: 200 }))
    globalThis.fetch = fetchMock as typeof fetch

    await expect(runAgent({ provider: 'ollama', model: 'model', userPrompt: 'noop', messages: [], files: [] }))
      .resolves.toEqual({ reply: 'repaired', patches: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain('Invalid response to repair')
  })

  it('throws useful errors for failed Ollama responses', async () => {
    globalThis.fetch = vi.fn(async () => new Response('model missing', { status: 404 })) as typeof fetch

    await expect(runAgent({ provider: 'ollama', model: 'missing', userPrompt: 'noop', messages: [], files: [] }))
      .rejects.toThrow('Ollama error 404: model missing')
  })

  it('requires an OpenRouter key when using OpenRouter', async () => {
    await expect(runAgent({ provider: 'openrouter', model: 'model', userPrompt: 'noop', messages: [], files: [] }))
      .rejects.toThrow('OpenRouter API key is required')
  })
})
