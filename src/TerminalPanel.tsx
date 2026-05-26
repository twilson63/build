import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { startShell } from './webcontainer'

export function TerminalPanel(props: { logs: string[]; enabled: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const logIndexRef = useRef(0)

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) return
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      theme: { background: '#050915', foreground: '#c5d2ee' },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(hostRef.current)
    fit.fit()
    terminal.writeln('Build terminal')
    terminal.writeln('WebContainer logs appear here. Interactive shell starts after boot.\r\n')
    terminalRef.current = terminal
    fitRef.current = fit

    const resize = () => fit.fit()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    for (const chunk of props.logs.slice(logIndexRef.current)) terminal.write(chunk)
    logIndexRef.current = props.logs.length
  }, [props.logs])

  useEffect(() => {
    const terminal = terminalRef.current
    const fit = fitRef.current
    if (!props.enabled || !terminal || !fit) return
    let disposed = false
    let dataDisposable: { dispose: () => void } | undefined

    async function connectShell(activeTerminal: Terminal, activeFit: FitAddon) {
      activeFit.fit()
      const controller = await startShell(chunk => activeTerminal.write(chunk), { cols: activeTerminal.cols, rows: activeTerminal.rows })
      if (disposed) return
      activeTerminal.writeln('\r\nInteractive shell ready. Try: npm install lucide-react\r\n')
      dataDisposable = activeTerminal.onData(data => { void controller.write(data) })
      activeTerminal.onResize(size => controller.resize(size.cols, size.rows))
    }

    connectShell(terminal, fit).catch(error => terminal.writeln(`\r\nFailed to start shell: ${error instanceof Error ? error.message : String(error)}\r\n`))
    return () => {
      disposed = true
      dataDisposable?.dispose()
    }
  }, [props.enabled])

  return <div className="terminal" ref={hostRef} />
}
