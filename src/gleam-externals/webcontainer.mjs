import { dispatchPreviewUrlChanged, dispatchProjectFilesUpdated, dispatchProjectSaveStatus, dispatchWebContainerBootFailed, dispatchWebContainerBootStarted, dispatchWebContainerBootSucceeded, dispatchWebContainerLog, dispatchWebContainerRemountFinished } from './runtime_bridge.mjs'

const fallbackStarterFiles = [
  { path: 'package.json', content: '{}' },
  { path: 'index.html', content: '<div id="root"></div>' },
  { path: 'src/main.tsx', content: 'console.log("Build")' },
]
let lastFiles = fallbackStarterFiles
const scheduledFileWrites = new Map()

async function modules() {
  try {
    const wc = await import('../webcontainer')
    const templates = await import('../templates')
    return { ...wc, starterFiles: templates.starterFiles }
  } catch {
    return {
      starterFiles: fallbackStarterFiles,
      mountProject: async files => { lastFiles = files },
      runInstall: async onLog => onLog('Install skipped outside browser WebContainer.'),
      startDevServer: async (_onLog, onUrl) => onUrl(''),
      readProjectFilesFromWebContainer: async () => lastFiles,
      writeProjectFile: async (path, content) => {
        lastFiles = lastFiles.map(file => file.path === path ? { path, content } : file)
      },
    }
  }
}

function message(error) { return error instanceof Error ? error.message : String(error) }
function reloadPreviewIframe() {
  const iframe = typeof document === 'undefined' ? null : document.querySelector('iframe[title="preview"]')
  if (iframe?.src) iframe.src = iframe.src
}
function gleamListToArray(list) { return typeof list?.toArray === 'function' ? list.toArray() : [] }
function normalizeFiles(files) {
  if (!files) return lastFiles
  if (Array.isArray(files)) return files
  return gleamListToArray(files).map(file => ({ path: file.path, content: file.content }))
}

export async function bootContainer(files) {
  const m = await modules()
  setLastFiles(normalizeFiles(files).length ? normalizeFiles(files) : m.starterFiles)
  dispatchWebContainerBootStarted()
  try {
    dispatchWebContainerLog('Booting WebContainer...')
    await m.mountProject(lastFiles)
    dispatchWebContainerLog('Installing dependencies...')
    await m.runInstall(line => dispatchWebContainerLog(line))
    dispatchWebContainerLog('Starting preview server...')
    await m.startDevServer(line => dispatchWebContainerLog(line), url => dispatchPreviewUrlChanged(url))
    dispatchWebContainerBootSucceeded()
  } catch (error) {
    dispatchWebContainerBootFailed(message(error))
  }
}

export async function mountAndInstall(files) {
  const m = await modules()
  if (files) setLastFiles(normalizeFiles(files))
  try {
    await m.mountProject(lastFiles)
    dispatchWebContainerLog('Installing project dependencies...')
    await m.runInstall(line => dispatchWebContainerLog(line))
  } finally {
    reloadPreviewIframe()
    dispatchWebContainerRemountFinished()
  }
}

export async function startDevServer() {
  const m = await modules()
  await m.startDevServer(line => dispatchWebContainerLog(line), url => dispatchPreviewUrlChanged(url))
}

function appendRuntimeLog(line) {
  globalThis.__buildLastRuntimeLog = line
  document.querySelector('build-terminal')?.write?.(line)
  dispatchWebContainerLog(line)
}

export async function runNpmInstall() {
  const m = await modules()
  globalThis.__buildLastNpmInstall = true
  appendRuntimeLog('package.json changed; running npm install...')
  await m.runInstall(line => appendRuntimeLog(line))
}

export async function readFilesFromContainer() {
  const m = await modules()
  const files = await m.readProjectFilesFromWebContainer()
  if (files.length) dispatchProjectFilesUpdated(files, `Synced ${files.length} files from terminal`)
  else dispatchProjectSaveStatus('No files found to sync')
}

export async function writeFileToContainer(path, content) {
  const m = await modules()
  await m.writeProjectFile(path, content)
}

export function scheduleWriteFileToContainer(delay, path, content) {
  const previous = scheduledFileWrites.get(path)
  if (previous) clearTimeout(previous)
  const timer = setTimeout(() => {
    scheduledFileWrites.delete(path)
    void writeFileToContainer(path, content)
  }, delay)
  scheduledFileWrites.set(path, timer)
}

export async function startShell(onOutput, terminal) {
  const m = await modules()
  return m.startShell(onOutput, terminal)
}

globalThis.__buildGleamStartShell = startShell

export function remountProject() { void mountAndInstall() }
export function setLastFiles(files) { lastFiles = files?.length ? files : fallbackStarterFiles }
