let runtime = null
let modulePromise = null

function inCompiledGleamOutput() {
  return import.meta.url.includes('/build/dev/javascript/build/gleam-externals/')
}

async function loadModules() {
  if (modulePromise) return modulePromise
  const compiled = inCompiledGleamOutput()
  const prefix = compiled ? '..' : '../../build/dev/javascript/build'
  const lustrePath = compiled ? '../../lustre/lustre.mjs' : '../../build/dev/javascript/lustre/lustre.mjs'
  const optionPath = compiled ? '../../gleam_stdlib/gleam/option.mjs' : '../../build/dev/javascript/gleam_stdlib/gleam/option.mjs'
  modulePromise = Promise.all([
    import(/* @vite-ignore */ lustrePath),
    import(/* @vite-ignore */ `${prefix}/gleam.mjs`),
    import(/* @vite-ignore */ optionPath),
    import(/* @vite-ignore */ `${prefix}/build/msg.mjs`),
    import(/* @vite-ignore */ `${prefix}/build/actors/project.mjs`),
    import(/* @vite-ignore */ `${prefix}/build/pure/templates.mjs`),
    import(/* @vite-ignore */ `${prefix}/build/actors/chat.mjs`),
    import(/* @vite-ignore */ `${prefix}/build/actors/webcontainer.mjs`),
    import(/* @vite-ignore */ `${prefix}/build/actors/preview.mjs`),
    import(/* @vite-ignore */ `${prefix}/build/actors/agent.mjs`),
    import(/* @vite-ignore */ `${prefix}/build/actors/settings.mjs`),
    import(/* @vite-ignore */ `${prefix}/build/pure/preview_inspector.mjs`),
  ]).then(([Lustre, Gleam, Option, Msg, Project, Templates, Chat, WebContainer, Preview, Agent, Settings, PreviewInspector]) => ({
    Lustre,
    toList: Gleam.toList,
    Option,
    Msg,
    Project,
    Templates,
    Chat,
    WebContainer,
    Preview,
    Agent,
    Settings,
    PreviewInspector,
  }))
  return modulePromise
}

export function registerRuntime(nextRuntime) {
  runtime = nextRuntime
  globalThis.__buildGleamRuntime = nextRuntime
}

export async function sendMsg(message) {
  const targetRuntime = runtime ?? globalThis.__buildGleamRuntime
  if (!targetRuntime) return
  const { Lustre } = await loadModules()
  targetRuntime.send(Lustre.dispatch(message))
}

export async function toGleamFiles(files = []) {
  const { toList, Templates } = await loadModules()
  return toList(files.map(file => Templates.ProjectFile$ProjectFile(file.path, file.content)))
}

export async function toGleamMessages(messages = []) {
  const { toList, Chat } = await loadModules()
  return toList(messages.map(message => Chat.Message$Message(
    message.role === 'user' ? Chat.Role$User() : Chat.Role$Assistant(),
    message.content,
  )))
}

export async function dispatchProjectListRefreshed(projects = []) {
  const { toList, Msg, Project } = await loadModules()
  sendMsg(Msg.Msg$Project(Project.Msg$ProjectListRefreshed(toList(projects.map(p => Project.SavedProject$SavedProject(p.id, p.name, p.updatedAt ?? p.updated_at ?? ''))))))
}

export async function dispatchProjectLoaded(project) {
  const { Msg, Project, Option } = await loadModules()
  sendMsg(Msg.Msg$Project(Project.Msg$ProjectLoaded(
    project?.id ? Option.Option$Some(project.id) : Option.Option$None(),
    project?.name ?? 'Untitled Project',
    await toGleamFiles(project?.files ?? []),
    project?.selectedPath ?? project?.selected_path ?? '',
    project?.updatedAt ?? project?.updated_at ?? '',
  )))
}

export async function dispatchProjectCreated(project) {
  const { Msg, Project } = await loadModules()
  sendMsg(Msg.Msg$Project(Project.Msg$ProjectCreated(
    project.id,
    project.name,
    await toGleamFiles(project.files ?? []),
    project.selectedPath ?? project.selected_path ?? 'src/main.tsx',
  )))
}

export async function dispatchProjectReady() { const { Msg, Project } = await loadModules(); sendMsg(Msg.Msg$Project(Project.Msg$ProjectReady())) }
export async function dispatchProjectSaveStatus(status) { const { Msg, Project } = await loadModules(); sendMsg(Msg.Msg$Project(Project.Msg$SaveStatusChanged(status))) }
export async function dispatchProjectFilesUpdated(files, status = '') { const { Msg, Project } = await loadModules(); sendMsg(Msg.Msg$Project(Project.Msg$FilesUpdated(await toGleamFiles(files), status))) }
export async function dispatchProjectsDialogClosed() { const { Msg, Project } = await loadModules(); sendMsg(Msg.Msg$Project(Project.Msg$ProjectsDialogClosed())) }

export async function dispatchChatMessagesReplaced(messages) { const { Msg, Chat } = await loadModules(); sendMsg(Msg.Msg$Chat(Chat.Msg$MessagesReplaced(await toGleamMessages(messages)))) }
export async function dispatchChatCleared() { const { Msg, Chat } = await loadModules(); sendMsg(Msg.Msg$Chat(Chat.Msg$ChatCleared())) }
export async function dispatchWebContainerRemountRequested(files) { const { Msg, WebContainer } = await loadModules(); sendMsg(Msg.Msg$WebContainer(WebContainer.Msg$RemountRequested(await toGleamFiles(files)))) }
export async function dispatchWebContainerLog(line) { const { Msg, WebContainer } = await loadModules(); sendMsg(Msg.Msg$WebContainer(WebContainer.Msg$LogAppended(line))) }
export async function dispatchWebContainerBootStarted() { const { Msg, WebContainer } = await loadModules(); sendMsg(Msg.Msg$WebContainer(WebContainer.Msg$BootStarted())) }
export async function dispatchWebContainerBootSucceeded() { const { Msg, WebContainer } = await loadModules(); sendMsg(Msg.Msg$WebContainer(WebContainer.Msg$BootSucceeded())) }
export async function dispatchWebContainerBootFailed(message) { const { Msg, WebContainer } = await loadModules(); sendMsg(Msg.Msg$WebContainer(WebContainer.Msg$BootFailed(message))) }
export async function dispatchWebContainerRemountFinished() { const { Msg, WebContainer } = await loadModules(); sendMsg(Msg.Msg$WebContainer(WebContainer.Msg$RemountFinished())) }
export async function dispatchPreviewUrlChanged(url) { const { Msg, Preview } = await loadModules(); sendMsg(Msg.Msg$Preview(Preview.Msg$PreviewUrlChanged(url))) }

export async function dispatchPreviewElementSelected(element) {
  const { toList, Msg, Preview, PreviewInspector } = await loadModules()
  const rect = element.boundingRect ?? {}
  const styles = Object.entries(element.computedStyles ?? {})
  sendMsg(Msg.Msg$Preview(Preview.Msg$ElementSelected(PreviewInspector.SelectedPreviewElement$SelectedPreviewElement(
    element.tagName ?? '',
    element.id ?? '',
    toList(element.classes ?? []),
    element.textContent ?? '',
    element.outerHTML ?? '',
    PreviewInspector.BoundingRect$BoundingRect(Number(rect.x ?? 0), Number(rect.y ?? 0), Number(rect.width ?? 0), Number(rect.height ?? 0)),
    toList(styles),
  ))))
}

export async function dispatchAgentSucceeded(requestId, reply, patches) { const { toList, Msg, Agent } = await loadModules(); sendMsg(Msg.Msg$Agent(Agent.Msg$AgentRequestSucceeded(requestId, reply, toList((patches ?? []).map(p => Agent.Patch$Patch(p.path, p.content)))))) }
export async function dispatchAgentFailed(requestId, message) { const { Msg, Agent } = await loadModules(); sendMsg(Msg.Msg$Agent(Agent.Msg$AgentRequestFailed(requestId, message))) }
export async function dispatchAgentTick(now) { const { Msg, Agent } = await loadModules(); sendMsg(Msg.Msg$Agent(Agent.Msg$AgentElapsedTick(now))) }
export async function dispatchSettingsStatus(status) { const { Msg, Settings } = await loadModules(); sendMsg(Msg.Msg$Settings(Settings.Msg$ConnectionStatusChanged(status))) }
