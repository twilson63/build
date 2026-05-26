import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { runAgent, type AgentProvider, type ChatMessage } from './agent'
import { starterFiles, upsertFile, type ProjectFile } from './templates'
import { downloadZip } from './zip'
import { mountProject, runInstall, startDevServer, writeProjectFile } from './webcontainer'
import './styles.css'

function App() {
  const [files, setFiles] = useState<ProjectFile[]>(starterFiles)
  const [selectedPath, setSelectedPath] = useState(starterFiles[2].path)
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<AgentProvider>((localStorage.getItem('agent-provider') as AgentProvider | null) ?? 'ollama')
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter-key') ?? '')
  const [ollamaUrl, setOllamaUrl] = useState(localStorage.getItem('ollama-url') ?? 'http://localhost:11434')
  const [model, setModel] = useState(localStorage.getItem('agent-model') ?? 'glm-5:cloud')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState('')
  const [agentStartedAt, setAgentStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)

  const selectedFile = useMemo(() => files.find(file => file.path === selectedPath) ?? files[0], [files, selectedPath])

  useEffect(() => {
    if (!agentStartedAt) return
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - agentStartedAt) / 1000)), 500)
    return () => window.clearInterval(timer)
  }, [agentStartedAt])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, agentStartedAt])

  useEffect(() => {
    let mounted = true
    async function boot() {
      try {
        appendLog('Booting WebContainer...')
        await mountProject(files)
        appendLog('Installing dependencies...')
        await runInstall(appendLog)
        appendLog('Starting preview server...')
        await startDevServer(appendLog, url => mounted && setPreviewUrl(url))
      } catch (error) {
        appendLog(error instanceof Error ? error.message : String(error))
      } finally {
        if (mounted) setBusy(false)
      }
    }
    boot()
    return () => { mounted = false }
    // boot exactly once with starter files
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function appendLog(line: string) {
    setLogs(current => [...current.slice(-200), line])
  }

  async function applyFile(path: string, content: string) {
    setFiles(current => upsertFile(current, path, content))
    await writeProjectFile(path, content)
  }

  function cancelAgent() {
    abortRef.current?.abort()
  }

  function clearChat() {
    setMessages([])
    setExpandedMessages(new Set())
  }

  async function resetProject() {
    cancelAgent()
    setBusy(true)
    clearChat()
    setSelectedPath(starterFiles[2].path)
    setFiles(starterFiles)
    try {
      appendLog('Resetting project to starter app...')
      await mountProject(starterFiles)
      await runInstall(appendLog)
    } catch (error) {
      appendLog(error instanceof Error ? error.message : String(error))
    } finally {
      setAgentStartedAt(null)
      setElapsedSeconds(0)
      setBusy(false)
    }
  }

  async function testOllama() {
    setConnectionStatus('Testing Ollama...')
    try {
      const baseUrl = ollamaUrl.trim().replace(/\/$/, '')
      const response = await fetch(`${baseUrl}/api/tags`)
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      const data = await response.json()
      const names = data.models?.map((m: { name: string }) => m.name).join(', ') || 'no models listed'
      setConnectionStatus(`Ollama reachable. Models: ${names}`)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setConnectionStatus(`Could not reach Ollama. If Ollama is running, this is likely CORS. Try: OLLAMA_ORIGINS=${location.origin} ollama serve. Details: ${detail}`)
    }
  }

  async function submit() {
    if (!prompt.trim() || busy) return
    if (provider === 'openrouter' && !apiKey.trim()) {
      alert('Paste an OpenRouter API key first, or switch to local Ollama.')
      return
    }
    localStorage.setItem('agent-provider', provider)
    localStorage.setItem('openrouter-key', apiKey.trim())
    localStorage.setItem('ollama-url', ollamaUrl.trim())
    localStorage.setItem('agent-model', model.trim())
    const userPrompt = prompt.trim()
    setPrompt('')
    setBusy(true)
    setElapsedSeconds(0)
    setAgentStartedAt(Date.now())
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 120_000)
    setMessages(current => [...current, { role: 'user', content: userPrompt }])
    try {
      const result = await runAgent({ provider, apiKey: apiKey.trim(), ollamaUrl: ollamaUrl.trim(), model: model.trim(), userPrompt, files, messages, signal: controller.signal })
      for (const patch of result.patches) await applyFile(patch.path, patch.content)
      if (result.patches.some(p => p.path === 'package.json')) {
        appendLog('package.json changed; running npm install...')
        await runInstall(appendLog)
      }
      setMessages(current => [...current, { role: 'assistant', content: result.reply }])
    } catch (error) {
      const rawMessage = error instanceof DOMException && error.name === 'AbortError' ? 'Request canceled or timed out after 120 seconds.' : error instanceof Error ? error.message : String(error)
      const message = provider === 'ollama' && /fetch|network|failed/i.test(rawMessage)
        ? `${rawMessage}\n\nOllama troubleshooting: make sure Ollama is running at ${ollamaUrl}. If it is running, restart it with CORS enabled: OLLAMA_ORIGINS=${location.origin} ollama serve`
        : rawMessage
      setMessages(current => [...current, { role: 'assistant', content: `Error: ${message}` }])
      appendLog(message)
    } finally {
      window.clearTimeout(timeout)
      abortRef.current = null
      setAgentStartedAt(null)
      setElapsedSeconds(0)
      setBusy(false)
    }
  }

  return <div className="app">
    <aside className="panel chat">
      <header>
        <h1>Build</h1>
        <p>Use an agent to create your application in a live browser workspace.</p>
      </header>
      <label>Provider
        <select value={provider} onChange={e => setProvider(e.target.value as AgentProvider)}>
          <option value="ollama">Ollama local/cloud</option>
          <option value="openrouter">OpenRouter</option>
        </select>
      </label>
      {provider === 'ollama' && <label>Ollama URL
        <input value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434" />
        <button type="button" className="secondary compact" onClick={testOllama}>Test Ollama connection</button>
        {connectionStatus && <small className="status">{connectionStatus}</small>}
      </label>}
      {provider === 'openrouter' && <label>OpenRouter API key
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-or-..." />
      </label>}
      <label>Model
        <input value={model} onChange={e => setModel(e.target.value)} placeholder={provider === 'ollama' ? 'glm-5:cloud' : 'anthropic/claude-3.5-sonnet'} />
      </label>
      <div className="chatTools">
        <span>{messages.length} messages</span>
        <button type="button" className="ghost compact" onClick={clearChat} disabled={messages.length === 0 || busy}>Clear chat</button>
      </div>
      <div className="messages" ref={messagesRef}>
        {messages.length === 0 && <p className="empty">Try: “Turn this into a CRM with contacts and notes using PGlite.”</p>}
        {messages.map((m, index) => {
          const expanded = expandedMessages.has(index)
          return <button
            type="button"
            key={index}
            className={`msg ${m.role} ${expanded ? 'expanded' : ''}`}
            onClick={() => setExpandedMessages(current => {
              const next = new Set(current)
              if (next.has(index)) next.delete(index)
              else next.add(index)
              return next
            })}
            title="Click to expand/collapse"
          >{m.content}</button>
        })}
      </div>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the app change you want..." onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }} />
      {agentStartedAt && <div className="thinking">Model is thinking… {elapsedSeconds}s</div>}
      <div className="actions">
        <button disabled={busy} onClick={submit}>{busy ? 'Working...' : 'Send'}</button>
        {agentStartedAt && <button className="secondary" onClick={cancelAgent}>Cancel</button>}
        <button className="secondary iconButton" title="Export ZIP" aria-label="Export ZIP" onClick={() => downloadZip(files)}>⬇️</button>
        <button className="secondary iconButton" title="Reset to default app" aria-label="Reset to default app" onClick={resetProject}>↺</button>
      </div>
    </aside>

    <main className="workspace">
      <section className="preview">
        <div className="bar"><strong>Preview</strong><span>{previewUrl || 'starting...'}</span></div>
        <div className="previewFrame">
          {previewUrl ? <iframe src={previewUrl} title="preview" /> : <div className="loading">Starting WebContainer...</div>}
          {agentStartedAt && <div className="previewOverlay">
            <div className="pulseOrb" />
            <strong>Agent is updating your app</strong>
            <span>Waiting for model response… {elapsedSeconds}s</span>
          </div>}
        </div>
      </section>
      <section className="bottom">
        <div className="files">
          {files.map(file => <button key={file.path} className={file.path === selectedPath ? 'active' : ''} onClick={() => setSelectedPath(file.path)}>{file.path}</button>)}
        </div>
        <textarea className="editor" value={selectedFile.content} onChange={async e => applyFile(selectedFile.path, e.target.value)} spellCheck={false} />
        <pre className="logs">{logs.join('')}</pre>
      </section>
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
