import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMount = vi.fn()
const mockMkdir = vi.fn()
const mockWriteFile = vi.fn()
const mockSpawn = vi.fn()
const mockOn = vi.fn()

vi.mock('@webcontainer/api', () => ({
  WebContainer: {
    boot: vi.fn(async () => ({
      mount: mockMount,
      fs: { mkdir: mockMkdir, writeFile: mockWriteFile },
      spawn: mockSpawn,
      on: mockOn,
    })),
  },
}))

function mockProcess(exitCode = 0) {
  return {
    exit: Promise.resolve(exitCode),
    output: { pipeTo: vi.fn() },
  }
}

describe('webcontainer helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockSpawn.mockResolvedValue(mockProcess())
  })

  it('boots only once and mounts project files as a WebContainer tree', async () => {
    const { WebContainer } = await import('@webcontainer/api')
    const { bootWebContainer, mountProject } = await import('./webcontainer')

    await bootWebContainer()
    await bootWebContainer()
    await mountProject([{ path: 'src/main.tsx', content: 'hello' }])

    expect(WebContainer.boot).toHaveBeenCalledOnce()
    expect(mockMount).toHaveBeenCalledWith({ src: { directory: { 'main.tsx': { file: { contents: 'hello' } } } } })
  })

  it('creates parent directories before writing nested files', async () => {
    const { writeProjectFile } = await import('./webcontainer')

    await writeProjectFile('src/components/App.tsx', 'content')

    expect(mockMkdir).toHaveBeenCalledWith('src/components', { recursive: true })
    expect(mockWriteFile).toHaveBeenCalledWith('src/components/App.tsx', 'content')
  })

  it('runs npm install and pipes process output', async () => {
    const proc = mockProcess(0)
    mockSpawn.mockResolvedValue(proc)
    const onLog = vi.fn()
    const { runInstall } = await import('./webcontainer')

    await expect(runInstall(onLog)).resolves.toBe(0)

    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install'])
    expect(proc.output.pipeTo).toHaveBeenCalledOnce()
  })

  it('starts the dev server and registers server-ready callback once', async () => {
    const { startDevServer } = await import('./webcontainer')

    await startDevServer(vi.fn(), vi.fn())
    await startDevServer(vi.fn(), vi.fn())

    expect(mockOn).toHaveBeenCalledWith('server-ready', expect.any(Function))
    expect(mockSpawn).toHaveBeenCalledOnce()
    expect(mockSpawn).toHaveBeenCalledWith('npm', ['run', 'dev'])
  })
})
