import type { FileSystemTree } from '@webcontainer/api'

export type ProjectFile = { path: string; content: string }

export const starterFiles: ProjectFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify(
      {
        scripts: { dev: 'vite --host 0.0.0.0' },
        dependencies: {
          '@vitejs/plugin-react': 'latest',
          '@electric-sql/pglite': 'latest',
          vite: 'latest',
          typescript: 'latest',
          react: 'latest',
          'react-dom': 'latest',
        },
        devDependencies: {},
        type: 'module',
      },
      null,
      2,
    ),
  },
  { path: 'index.html', content: '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n' },
  {
    path: 'src/main.tsx',
    content: `import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { db } from './db'
import './build-inspector'
import './style.css'

type Note = { id: number; text: string }

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')

  async function refresh() {
    await db.query('create table if not exists notes (id serial primary key, text text not null)')
    const result = await db.query<Note>('select * from notes order by id desc')
    setNotes(result.rows)
  }

  async function addNote() {
    if (!text.trim()) return
    await db.query('insert into notes (text) values ($1)', [text.trim()])
    setText('')
    await refresh()
  }

  useEffect(() => { refresh() }, [])

  return <main>
    <section className="hero">
      <p className="eyebrow">Browser app builder MVP</p>
      <h1>Realtime React + PGlite app</h1>
      <p>Ask the agent to change this app. The preview updates from a StackBlitz WebContainer.</p>
    </section>
    <section className="card">
      <h2>Local PGlite notes</h2>
      <div className="row">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Write a note" />
        <button onClick={addNote}>Add</button>
      </div>
      <ul>{notes.map(note => <li key={note.id}>{note.text}</li>)}</ul>
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
`,
  },
  {
    path: 'src/db.ts',
    content: `import { PGlite } from '@electric-sql/pglite'

export const db = new PGlite('idb://preview-app')
`,
  },
  {
    path: 'src/build-inspector.ts',
    content: `const STYLE_ID = 'build-inspector-style'
let enabled = false
let hovered: Element | null = null

const style = document.createElement('style')
style.id = STYLE_ID
style.textContent = '[data-build-inspector-hover] { outline: 2px solid #6d8dff !important; outline-offset: 3px !important; cursor: crosshair !important; }'

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) document.head.appendChild(style)
}

function computedStylesFor(element: Element) {
  const styles = getComputedStyle(element)
  return {
    color: styles.color,
    backgroundColor: styles.backgroundColor,
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    display: styles.display,
    padding: styles.padding,
    margin: styles.margin,
    borderRadius: styles.borderRadius,
  }
}

function clearHover() {
  hovered?.removeAttribute('data-build-inspector-hover')
  hovered = null
}

function enable() {
  enabled = true
  ensureStyle()
}

function disable() {
  enabled = false
  clearHover()
}

window.addEventListener('message', event => {
  if (event.data?.type === 'BUILD_INSPECTOR_ENABLE') enable()
  if (event.data?.type === 'BUILD_INSPECTOR_DISABLE') disable()
})

document.addEventListener('mouseover', event => {
  if (!enabled || !(event.target instanceof Element)) return
  clearHover()
  hovered = event.target
  hovered.setAttribute('data-build-inspector-hover', 'true')
}, true)

document.addEventListener('click', event => {
  if (!enabled || !(event.target instanceof Element)) return
  event.preventDefault()
  event.stopPropagation()
  const element = event.target
  const rect = element.getBoundingClientRect()
  window.parent.postMessage({
    type: 'BUILD_ELEMENT_SELECTED',
    element: {
      tagName: element.tagName,
      id: element.id,
      classes: Array.from(element.classList),
      textContent: (element.textContent || '').trim().slice(0, 1000),
      outerHTML: element.outerHTML.slice(0, 4000),
      boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      computedStyles: computedStylesFor(element),
    },
  }, '*')
  disable()
}, true)
`,
  },
  {
    path: 'src/style.css',
    content: `:root { color: #162033; background: #f6f8fb; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; }
main { max-width: 900px; margin: 0 auto; padding: 56px 24px; }
.hero { padding: 36px; border-radius: 28px; background: linear-gradient(135deg, #eef4ff, #fff); box-shadow: 0 20px 60px #1d355711; }
.eyebrow { color: #3366ff; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { font-size: clamp(2.5rem, 8vw, 5rem); line-height: .95; margin: 0 0 16px; }
.card { margin-top: 24px; padding: 24px; border-radius: 24px; background: white; box-shadow: 0 14px 40px #1d35570f; }
.row { display: flex; gap: 12px; }
input { flex: 1; padding: 12px 14px; border: 1px solid #d5dceb; border-radius: 12px; font: inherit; }
button { padding: 12px 18px; border: 0; border-radius: 12px; background: #3366ff; color: white; font-weight: 700; cursor: pointer; }
li { margin: 10px 0; }
`,
  },
]

export function filesToTree(files: ProjectFile[]): FileSystemTree {
  const root: FileSystemTree = {}
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    let node: FileSystemTree = root
    for (const part of parts.slice(0, -1)) {
      const existing = node[part]
      if (!existing || 'file' in existing) node[part] = { directory: {} }
      node = (node[part] as { directory: FileSystemTree }).directory
    }
    node[parts.at(-1)!] = { file: { contents: file.content } }
  }
  return root
}

export function upsertFile(files: ProjectFile[], path: string, content: string): ProjectFile[] {
  const normalized = path.replace(/^\/+/, '')
  const existing = files.find(file => file.path === normalized)
  if (existing) return files.map(file => file.path === normalized ? { path: normalized, content } : file)
  return [...files, { path: normalized, content }].sort((a, b) => a.path.localeCompare(b.path))
}
