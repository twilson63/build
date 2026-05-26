import type { ProjectFile } from './templates'

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string }
export type AgentProvider = 'ollama' | 'openrouter'
export type AgentPatch = { path: string; content: string }
export type AgentResult = { reply: string; patches: AgentPatch[] }

const SYSTEM_PROMPT = `You are an app-building agent inside a browser-only StackBlitz WebContainer.
Return ONLY valid JSON with this exact shape: {"reply":"short user-facing summary","patches":[{"path":"src/App.tsx","content":"full file content"}]}.
Rules:
- Modify files by returning full replacement contents.
- Prefer Vite + React + TypeScript.
- Use @electric-sql/pglite for local browser databases.
- Do not use native Node modules, server-only packages, Docker, or external databases.
- Keep changes small, coherent, and runnable.
- If changing dependencies, replace package.json too.
`

type AgentArgs = {
  provider: AgentProvider
  apiKey?: string
  ollamaUrl?: string
  model: string
  userPrompt: string
  files: ProjectFile[]
  messages: ChatMessage[]
  signal?: AbortSignal
}

function projectContext(files: ProjectFile[]) {
  return files.map(file => `--- ${file.path}\n${file.content}`).join('\n\n')
}

function extractJson(text: string): AgentResult {
  const trimmed = text.trim()
  const raw = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    : trimmed
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed.patches) || typeof parsed.reply !== 'string') throw new Error('Agent response did not match expected JSON shape')
  return parsed
}

function messagesWithContext(args: { userPrompt: string; files: ProjectFile[]; messages: ChatMessage[] }) {
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...args.messages.slice(-8),
    { role: 'user' as const, content: `Current project files:\n${projectContext(args.files)}\n\nUser request: ${args.userPrompt}` },
  ]
}

export async function runAgent(args: AgentArgs): Promise<AgentResult> {
  return args.provider === 'ollama' ? runOllamaAgent(args) : runOpenRouterAgent(args)
}

async function runOllamaAgent(args: AgentArgs) {
  const baseUrl = (args.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      stream: false,
      format: 'json',
      options: { temperature: 0.2 },
      messages: messagesWithContext(args),
    }),
    signal: args.signal,
  })

  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`)
  const data = await response.json()
  const content = data.message?.content
  if (!content) throw new Error('Ollama returned no message content')
  return extractJson(content)
}

async function runOpenRouterAgent(args: AgentArgs) {
  if (!args.apiKey?.trim()) throw new Error('OpenRouter API key is required for the OpenRouter provider')

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
      'HTTP-Referer': globalThis.location?.origin ?? 'http://localhost',
      'X-Title': 'Browser App Builder MVP',
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: messagesWithContext(args),
    }),
    signal: args.signal,
  })

  if (!response.ok) throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`)
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter returned no message content')
  return extractJson(content)
}
