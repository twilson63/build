import { useEffect, useRef } from 'react'
import { CodeEditor } from './CodeEditor'
import { TerminalPanel } from './TerminalPanel'
import { isSelectedElementMessage, summarizeSelectedElement } from './preview-inspector'
import { useAppStore, useDispatch } from './store'
import { downloadZip } from './zip'
import { formatUpdatedAt } from './projects'
import type { AgentProvider } from './agent'

export function App() {
  const state = useAppStore()
  const dispatch = useDispatch()
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLIFrameElement | null>(null)
  const initializedRef = useRef(false)

  const running = state.agent.lifecycle.status === 'running'
  const busy = running || state.webcontainer.bootPhase.phase !== 'ready'
  const selectedFile = state.project.files.find(file => file.path === state.project.selectedPath) ?? state.project.files[0]

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    dispatch({ type: 'init_app' })
  }, [dispatch])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.chat.messages.length, running])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isSelectedElementMessage(event.data)) return
      dispatch({ type: 'preview', msg: { type: 'element_selected', element: event.data.element } })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [dispatch])

  useEffect(() => {
    previewRef.current?.contentWindow?.postMessage({ type: state.preview.selectingElement ? 'BUILD_INSPECTOR_ENABLE' : 'BUILD_INSPECTOR_DISABLE' }, '*')
  }, [state.preview.selectingElement, state.preview.previewUrl])

  function newProject() {
    if (!window.confirm('Create a new project? Unsaved changes may be lost.')) return
    dispatch({ type: 'new_project' })
  }

  function removeProject(id: string, name: string) {
    if (!window.confirm(`Delete ${name}?`)) return
    dispatch({ type: 'remove_project', id })
  }

  function resetProject() {
    dispatch({ type: 'reset_project' })
  }

  function submitPrompt() {
    if (!state.chat.prompt.trim() || busy) return
    if (!state.settings.model.trim() || (state.settings.provider === 'openrouter' && !state.settings.apiKey.trim())) {
      alert(!state.settings.model.trim() ? 'Choose a model before sending a prompt.' : 'Paste an OpenRouter API key first, or switch to local Ollama.')
    }
    dispatch({ type: 'submit_prompt' })
  }

  function improveSelectedElement() {
    if (!state.preview.selectedElement || !state.preview.elementComment.trim() || busy) return
    if (!state.settings.model.trim() || (state.settings.provider === 'openrouter' && !state.settings.apiKey.trim())) {
      alert(!state.settings.model.trim() ? 'Choose a model before improving the selected element.' : 'Paste an OpenRouter API key first, or switch to local Ollama.')
    }
    dispatch({ type: 'improve_selected_element' })
  }

  return <div className="app">
    <aside className="panel chat">
      <header>
        <div className="titleRow">
          <h1>Build</h1>
          <button type="button" className="secondary iconButton" title="Model settings" aria-label="Model settings" onClick={() => dispatch({ type: 'settings', msg: { type: 'settings_opened' } })}>⚙️</button>
        </div>
        <p>Use an agent to create your application in a live browser workspace.</p>
      </header>

      <section className="projectControls" aria-label="Project controls">
        <div className="projectMeta">
          <small>Project</small>
          {state.project.nameEditing ? <input
            className="projectNameInput"
            autoFocus
            value={state.project.projectName}
            onChange={e => dispatch({ type: 'project', msg: { type: 'project_name_changed', name: e.target.value } })}
            onBlur={() => dispatch({ type: 'project', msg: { type: 'project_name_editing_set', editing: false } })}
            onKeyDown={e => { if (e.key === 'Enter') dispatch({ type: 'project', msg: { type: 'project_name_editing_set', editing: false } }) }}
            placeholder="Untitled Project"
          /> : <div className="projectNameRow">
            <strong title={state.project.projectName}>{state.project.projectName.trim() || 'Untitled Project'}</strong>
            <button type="button" className="ghost miniIcon" title="Rename project" aria-label="Rename project" onClick={() => dispatch({ type: 'project', msg: { type: 'project_name_editing_set', editing: true } })}>✎</button>
          </div>}
          <small className="status">{state.project.saveStatus}</small>
        </div>
        <div className="projectToolbar">
          <button type="button" className="secondary iconButton" title="Open projects" aria-label="Open projects" onClick={() => dispatch({ type: 'project', msg: { type: 'projects_dialog_opened' } })}>📁</button>
          <button type="button" className="secondary iconButton" title="New project" aria-label="New project" onClick={newProject} disabled={busy}>＋</button>
        </div>
      </section>

      {state.settings.settingsOpen && <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && state.settings.model.trim()) dispatch({ type: 'settings', msg: { type: 'settings_closed' } }) }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="modalHeader">
            <div>
              <h2 id="settings-title">Model settings</h2>
              <p>Choose how Build connects to an LLM.</p>
            </div>
            <button type="button" className="ghost iconButton" aria-label="Close settings" disabled={!state.settings.model.trim()} onClick={() => dispatch({ type: 'settings', msg: { type: 'settings_closed' } })}>×</button>
          </div>
          <label>Provider
            <select value={state.settings.provider} onChange={e => dispatch({ type: 'settings', msg: { type: 'provider_changed', provider: e.target.value as AgentProvider } })}>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama local/cloud</option>
            </select>
          </label>
          {state.settings.provider === 'ollama' && <label>Ollama URL
            <input value={state.settings.ollamaUrl} onChange={e => dispatch({ type: 'settings', msg: { type: 'ollama_url_changed', url: e.target.value } })} placeholder="http://localhost:11434" />
            <button type="button" className="secondary compact" onClick={() => dispatch({ type: 'settings', msg: { type: 'test_ollama' } })}>Test Ollama connection</button>
            {state.settings.connectionStatus && <small className="status">{state.settings.connectionStatus}</small>}
          </label>}
          {state.settings.provider === 'openrouter' && <label>OpenRouter API key
            <input type="password" value={state.settings.apiKey} onChange={e => dispatch({ type: 'settings', msg: { type: 'api_key_changed', apiKey: e.target.value } })} placeholder="sk-or-..." />
          </label>}
          <label>Model
            <input value={state.settings.model} onChange={e => dispatch({ type: 'settings', msg: { type: 'model_changed', model: e.target.value } })} placeholder={state.settings.provider === 'ollama' ? 'glm-5:cloud' : 'anthropic/claude-3.5-sonnet'} />
          </label>
          <div className="modalActions">
            <button type="button" onClick={() => dispatch({ type: 'save_settings' })} disabled={!state.settings.model.trim() || (state.settings.provider === 'openrouter' && !state.settings.apiKey.trim())}>Save settings</button>
          </div>
        </div>
      </div>}

      {state.project.projectsOpen && <div className="modalBackdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) dispatch({ type: 'project', msg: { type: 'projects_dialog_closed' } }) }}>
        <div className="modal projectModal" role="dialog" aria-modal="true" aria-labelledby="projects-title">
          <div className="modalHeader">
            <div>
              <h2 id="projects-title">Projects</h2>
              <p>Saved anonymously in this browser with IndexedDB.</p>
            </div>
            <button type="button" className="ghost iconButton" aria-label="Close projects" onClick={() => dispatch({ type: 'project', msg: { type: 'projects_dialog_closed' } })}>×</button>
          </div>
          <button type="button" onClick={newProject} disabled={busy}>+ New Project</button>
          <div className="projectList">
            {state.project.savedProjects.length === 0 && <p className="empty">No saved projects yet. Save this project or create a new one.</p>}
            {state.project.savedProjects.map(project => <article className="projectCard" key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <small>Updated {formatUpdatedAt(project.updatedAt)}{project.id === state.project.currentProjectId ? ' · current' : ''}</small>
              </div>
              <div className="projectActions">
                <button type="button" className="secondary compact" onClick={() => dispatch({ type: 'open_project', id: project.id })} disabled={busy}>Open</button>
                <button type="button" className="ghost compact" onClick={() => removeProject(project.id, project.name)} disabled={busy}>Delete</button>
              </div>
            </article>)}
          </div>
        </div>
      </div>}

      {state.preview.selectedElement && <section className="selectedElementPanel">
        <div>
          <small>Selected element</small>
          <strong>{summarizeSelectedElement(state.preview.selectedElement)}</strong>
          <p>{state.preview.selectedElement.textContent || state.preview.selectedElement.outerHTML.slice(0, 120)}</p>
        </div>
        <textarea value={state.preview.elementComment} onChange={e => dispatch({ type: 'preview', msg: { type: 'element_comment_changed', comment: e.target.value } })} placeholder="Comment on how this element should improve..." />
        <div className="actions">
          <button type="button" className="secondary compact" onClick={improveSelectedElement} disabled={busy || !state.preview.elementComment.trim()}>Improve selected</button>
          <button type="button" className="ghost compact" onClick={() => dispatch({ type: 'preview', msg: { type: 'element_cleared' } })}>Clear</button>
        </div>
      </section>}

      <div className="chatTools">
        <span>{state.chat.messages.length} messages</span>
        <button type="button" className="ghost compact" onClick={() => dispatch({ type: 'chat', msg: { type: 'chat_cleared' } })} disabled={state.chat.messages.length === 0 || busy}>Clear chat</button>
      </div>
      <div className="messages" ref={messagesRef}>
        {state.chat.messages.length === 0 && <p className="empty">Try: “Turn this into a CRM with contacts and notes using PGlite.”</p>}
        {state.chat.messages.map((m, index) => {
          const expanded = state.chat.expandedMessages.has(index)
          return <button
            type="button"
            key={index}
            className={`msg ${m.role} ${expanded ? 'expanded' : ''}`}
            onClick={() => dispatch({ type: 'chat', msg: { type: 'message_toggled', index } })}
            title="Click to expand/collapse"
          >{m.content}</button>
        })}
      </div>
      <textarea value={state.chat.prompt} onChange={e => dispatch({ type: 'chat', msg: { type: 'prompt_changed', value: e.target.value } })} placeholder="Describe the app change you want..." onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitPrompt() }} />
      {running && <div className="thinking">Model is thinking… {state.agent.elapsedSeconds}s</div>}
      <div className="actions">
        <button disabled={busy} onClick={submitPrompt}>{busy ? 'Working...' : 'Send'}</button>
        {running && <button className="secondary" onClick={() => dispatch({ type: 'cancel_agent' })}>Cancel</button>}
        <button className="secondary iconButton" title="Export ZIP" aria-label="Export ZIP" onClick={() => downloadZip([...state.project.files])}>⬇️</button>
        <button className="secondary iconButton" title="Reset to default app" aria-label="Reset to default app" onClick={resetProject}>↺</button>
      </div>
    </aside>

    <main className="workspace">
      <section className="preview">
        <div className="bar"><strong>Preview</strong><span>{state.preview.previewUrl || 'starting...'}</span><button type="button" className={state.preview.selectingElement ? 'selectingButton' : 'ghost compact'} onClick={() => dispatch({ type: 'preview', msg: { type: 'element_select_toggled' } })}>{state.preview.selectingElement ? 'Selecting...' : 'Select element'}</button></div>
        <div className="previewFrame">
          {state.preview.previewUrl ? <iframe ref={previewRef} src={state.preview.previewUrl} title="preview" /> : <div className="loading">Starting WebContainer...</div>}
          {running && <div className="previewOverlay">
            <div className="pulseOrb" />
            <strong>Agent is updating your app</strong>
            <span>Waiting for model response… {state.agent.elapsedSeconds}s</span>
          </div>}
        </div>
      </section>
      <section className="bottom">
        <div className="files">
          {state.project.files.map(file => <button key={file.path} className={file.path === state.project.selectedPath ? 'active' : ''} onClick={() => dispatch({ type: 'project', msg: { type: 'selected_path_changed', path: file.path } })}>{file.path}</button>)}
        </div>
        <div className="editor">
          {selectedFile && <CodeEditor path={selectedFile.path} value={selectedFile.content} onChange={value => dispatch({ type: 'project', msg: { type: 'file_applied', path: selectedFile.path, content: value } })} />}
        </div>
        <div className="terminalPane">
          <div className="terminalToolbar">
            <span>Terminal</span>
            <button type="button" className="ghost compact" onClick={() => dispatch({ type: 'sync_files_from_terminal' })}>Sync files</button>
          </div>
          <TerminalPanel logs={[...state.webcontainer.logs]} enabled={state.project.projectReady && !busy} />
        </div>
      </section>
    </main>
  </div>
}
