import { WebContainer, type WebContainerProcess } from '@webcontainer/api'
import { filesToTree, type ProjectFile } from './templates'

let instance: Promise<WebContainer> | undefined

export function bootWebContainer() {
  instance ??= WebContainer.boot()
  return instance
}

export async function mountProject(files: ProjectFile[]) {
  const wc = await bootWebContainer()
  await wc.mount(filesToTree(files))
  return wc
}

export async function writeProjectFile(path: string, content: string) {
  const wc = await bootWebContainer()
  const parts = path.split('/').filter(Boolean)
  if (parts.length > 1) await wc.fs.mkdir(parts.slice(0, -1).join('/'), { recursive: true })
  await wc.fs.writeFile(path, content)
}

export async function runInstall(onLog: (line: string) => void) {
  const wc = await bootWebContainer()
  const proc = await wc.spawn('npm', ['install'])
  pipeOutput(proc, onLog)
  return proc.exit
}

let devProcess: WebContainerProcess | undefined

export async function startDevServer(onLog: (line: string) => void, onUrl: (url: string) => void) {
  const wc = await bootWebContainer()
  if (devProcess) return
  wc.on('server-ready', (_port, url) => onUrl(url))
  devProcess = await wc.spawn('npm', ['run', 'dev'])
  pipeOutput(devProcess, onLog)
}

function pipeOutput(proc: WebContainerProcess, onLog: (line: string) => void) {
  proc.output.pipeTo(new WritableStream({ write: chunk => onLog(String(chunk)) }))
}
