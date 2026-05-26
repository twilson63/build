import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { runAgent, type AgentProvider, type ChatMessage } from './agent'
import { CodeEditor } from './CodeEditor'
import { createProject, deleteProject, formatUpdatedAt, getCurrentProjectId, getProject, listProjects, saveProject, setCurrentProjectId as persistCurrentProjectId, type SavedProject } from './projects'
import { TerminalPanel } from './TerminalPanel'
import { starterFiles, upsertFile, type ProjectFile } from './templates'
import { downloadZip } from './zip'
import { mountProject, runInstall, startDevServer, writeProjectFile } from './webcontainer'
import './styles.css'

function App() {
  const [files, setFiles] = useState<ProjectFile[]>(starterFiles)
  const [selectedPath, setSelectedPath] = useState(starterFiles[2].path)
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<AgentProvider>((localStorage.getItem('agent-provider') as AgentProvider | null) ?? 'openrouter')
  const [apiKey, setApiKey] = useState(localStorage.getItem('openrouter-key') ?? '')
  const [ollamaUrl, setOllamaUrl] = useState(localStorage.getItem('ollama-url') ?? 'http://localhost:11434')
  const [model, setModel] = useState(localStorage.getItem('agent-model') ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [previewUrl, setPreviewUrl] = useState('')
  const [busy, setBusy] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState('')
  const [agentStartedAt, setAgentStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(!localStorage.getItem('agent-model'))
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([])
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('Untitled Project')
  const [saveStatus, setSaveStatus] = useState('Not saved')
  const [projectReady, setProjectReady] = useState(false)
  const [nameEditing, setNameEditing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const autoSaveTimerRef = useRef<number | null>(null)
  const hydratedRef = useRef(false)
  const suppressAutoSaveRef = useRef(false)

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
    async function loadInitialProject() {
      try {
        const projects = await listProjects()
        setSavedProjects(projects)
        const id = await getCurrentProjectId()
        const project = id ? await getProject(id) : undefined
        if (project) {
          setCurrentProjectIdState(project.id)
          setProjectName(project.name)
          setFiles(project.files.length ? project.files : starterFiles)
          setMessages(project.messages)
          setSelectedPath(project.selectedPath || starterFiles[2].path)
          setSaveStatus(`Loaded ${formatUpdatedAt(project.updatedAt)}`)
        }
      } catch (error) {
        appendLog(error instanceof Error ? error.message : String(error))
      } finally {
        setProjectReady(true)
      }
    }
    loadInitialProject()
  }, [])

  useEffect(() => {
    if (!projectReady) return
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
        if (mounted) {
          setBusy(false)
          window.setTimeout(() => { hydratedRef.current = true }, 0)
        }
      }
    }
    boot()
    return () => { mounted = false }
    // boot exactly once after IndexedDB project hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectReady])

  useEffect(() => {
    if (!hydratedRef.current || suppressAutoSaveRef.current) return
    setSaveStatus('Saving...')
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(() => {
      saveCurrentProject({ silent: true }).catch(error => {
        const message = error instanceof Error ? error.message : String(error)
        setSaveStatus(`Auto-save failed: ${message}`)
      })
    }, 900)
    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
    }
    // auto-save project state after user edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, messages, selectedPath, projectName])

  function appendLog(line: string) {
    setLogs(current => [...current.slice(-200), line])
  }

  async function refreshProjectList() {
    setSavedProjects(await listProjects())
  }

  async function applyFile(path: string, content: string) {
    setFiles(current => upsertFile(current, path, content))
    await writeProjectFile(path, content)
    setSaveStatus('Unsaved changes')
  }

  async function remountProject(nextFiles: ProjectFile[]) {
    suppressAutoSaveRef.current = true
    setBusy(true)
    try {
      await mountProject(nextFiles)
      appendLog('Installing project dependencies...')
      await runInstall(appendLog)
    } finally {
      setBusy(false)
      window.setTimeout(() => { suppressAutoSaveRef.current = false }, 0)
    }
  }

  function cancelAgent() {
    abortRef.current?.abort()
  }

  function clearChat() {
    setMessages([])
    setExpandedMessages(new Set())
    setSaveStatus('Unsaved changes')
  }

  async function saveCurrentProject(options: { silent?: boolean } = {}) {
    const name = projectName.trim() || 'Untitled Project'
    const now = new Date().toISOString()
    const existing = currentProjectId ? await getProject(currentProjectId) : undefined
    const project = existing
      ? { ...existing, name, files, messages, selectedPath, updatedAt: now }
      : await createProject({ name, files, messages, selectedPath })

    const saved = existing ? await saveProject(project) : project
    setCurrentProjectIdState(saved.id)
    await persistCurrentProjectId(saved.id)
    if (projectName !== saved.name) setProjectName(saved.name)
    setSaveStatus(options.silent ? `Auto-saved ${formatUpdatedAt(saved.updatedAt)}` : 'Saved just now')
    await refreshProjectList()
  }

  async function newProject() {
    if (!window.confirm('Create a new project? Unsaved changes may be lost.')) return
    cancelAgent()
    const created = await createProject({ name: 'Untitled Project', files: starterFiles, messages: [], selectedPath: starterFiles[2].path })
    await persistCurrentProjectId(created.id)
    setCurrentProjectIdState(created.id)
    setProjectName(created.name)
    setFiles(created.files)
    setMessages([])
    setExpandedMessages(new Set())
    setSelectedPath(created.selectedPath)
    setSaveStatus('Saved just now')
    await refreshProjectList()
    await remountProject(created.files)
  }

  async function openProject(project: SavedProject) {
    cancelAgent()
    await persistCurrentProjectId(project.id)
    setCurrentProjectIdState(project.id)
    setProjectName(project.name)
    setFiles(project.files)
    setMessages(project.messages)
    setExpandedMessages(new Set())
    setSelectedPath(project.selectedPath || project.files[0]?.path || starterFiles[2].path)
    setProjectsOpen(false)
    setSaveStatus(`Loaded ${formatUpdatedAt(project.updatedAt)}`)
    await remountProject(project.files)
  }

  async function removeProject(project: SavedProject) {
    if (!window.confirm(`Delete ${project.name}?`)) return
    await deleteProject(project.id)
    if (project.id === currentProjectId) {
      await persistCurrentProjectId(null)
      setCurrentProjectIdState(null)
      setProjectName('Untitled Project')
      setFiles(starterFiles)
      setMessages([])
      setSelectedPath(starterFiles[2].path)
      setSaveStatus('Not saved')
      await remountProject(starterFiles)
    }
    await refreshProjectList()
  }

  async function resetProject() {
    cancelAgent()
    setBusy(true)
    clearChat()
    setSelectedPath(starterFiles[2].path)
    setFiles(starterFiles)
    setSaveStatus('Unsaved changes')
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

  function saveModelSettings() {
    localStorage.setItem('agent-provider', provider)
    localStorage.setItem('openrouter-key', apiKey.trim())
    localStorage.setItem('ollama-url', ollamaUrl.trim())
    localStorage.setItem('agent-model', model.trim())
    setSettingsOpen(false)
  }

  function selectProvider(nextProvider: AgentProvider) {
    setProvider(nextProvider)
    if (!model.trim()) setModel(nextProvider === 'ollama' ? 'glm-5:cloud' : 'anthropic/claude-3.5-sonnet')
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
    if (!model.trim() || (provider === 'openrouter' && !apiKey.trim())) {
      setSettingsOpen(true)
      alert(!model.trim() ? 'Choose a model before sending a prompt.' : 'Paste an OpenRouter API key first, or switch to local Ollama.')
      return
    }
    saveModelSettings()
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
      setSaveStatus('Unsaved changes')
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
        <div className="titleRow">
          <h1>Build</h1>
          <button type="button" className="secondary iconButton" title="Model settings" aria-label="Model settings" onClick={() => setSettingsOpen(true)}>⚙️</button>
        </div>
        <p>Use an agent to create your application in a live browser workspace.</p>
      </header>

      <section className="projectControls" aria-label="Project controls">
        <div className="projectMeta">
          <small>Project</small>
          {nameEditing ? <input
            className="projectNameInput"
            autoFocus
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            onBlur={() => setNameEditing(false)}
            onKeyDown={e => { if (e.key === 'Enter') setNameEditing(false) }}
            placeholder="Untitled Project"
          /> : <div className="projectNameRow">
            <strong title={projectName}>{projectName.trim() || 'Untitled Project'}</strong>
            <button type="button" className="ghost miniIcon" title="Rename project" aria-label="Rename project" onClick={() => setNameEditing(true)}>✎</button>
          </div>}
          <small className="status">{saveStatus}</small>
        </div>
        <div className="projectToolbar">
          <button type="button" className="secondary iconButton" title="Open projects" aria-label="Open projects" onClick={() => setProjectsOpen(true)}>📁</button>
          <button type="button" className="secondary iconButton" title="New project" aria-label="New project" onClick={newProject} disabled={busy}>＋</button>
        </div>
      </section>

      {settingsOpen && <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && model.trim()) setSettingsOpen(false) }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="modalHeader">
            <div>
              <h2 id="settings-title">Model settings</h2>
              <p>Choose how Build connects to an LLM.</p>
            </div>
            <button type="button" className="ghost iconButton" aria-label="Close settings" disabled={!model.trim()} onClick={() => setSettingsOpen(false)}>×</button>
          </div>
          <label>Provider
            <select value={provider} onChange={e => selectProvider(e.target.value as AgentProvider)}>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama local/cloud</option>
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
          <div className="modalActions">
            <button type="button" onClick={saveModelSettings} disabled={!model.trim() || (provider === 'openrouter' && !apiKey.trim())}>Save settings</button>
          </div>
        </div>
      </div>}

      {projectsOpen && <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setProjectsOpen(false) }}>
        <div className="modal projectModal" role="dialog" aria-modal="true" aria-labelledby="projects-title">
          <div className="modalHeader">
            <div>
              <h2 id="projects-title">Projects</h2>
              <p>Saved anonymously in this browser with IndexedDB.</p>
            </div>
            <button type="button" className="ghost iconButton" aria-label="Close projects" onClick={() => setProjectsOpen(false)}>×</button>
          </div>
          <button type="button" onClick={newProject} disabled={busy}>+ New Project</button>
          <div className="projectList">
            {savedProjects.length === 0 && <p className="empty">No saved projects yet. Save this project or create a new one.</p>}
            {savedProjects.map(project => <article className="projectCard" key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <small>Updated {formatUpdatedAt(project.updatedAt)}{project.id === currentProjectId ? ' · current' : ''}</small>
              </div>
              <div className="projectActions">
                <button type="button" className="secondary compact" onClick={() => openProject(project)} disabled={busy}>Open</button>
                <button type="button" className="ghost compact" onClick={() => removeProject(project)} disabled={busy}>Delete</button>
              </div>
            </article>)}
          </div>
        </div>
      </div>}

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
        <div className="editor">
          <CodeEditor path={selectedFile.path} value={selectedFile.content} onChange={value => void applyFile(selectedFile.path, value)} />
        </div>
        <TerminalPanel logs={logs} enabled={projectReady && !busy} />
      </section>
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
