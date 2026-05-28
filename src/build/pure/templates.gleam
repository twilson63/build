import gleam/list
import gleam/string

pub type ProjectFile {
  ProjectFile(path: String, content: String)
}

pub type FileTree {
  File(contents: String)
  Directory(children: List(#(String, FileTree)))
}

pub fn starter_files() -> List(ProjectFile) {
  [
    ProjectFile("package.json", package_json()),
    ProjectFile(
      "index.html",
      "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script>\n",
    ),
    ProjectFile("src/main.tsx", main_tsx()),
    ProjectFile("src/db.ts", db_ts()),
    ProjectFile("src/build-inspector.ts", build_inspector_ts()),
    ProjectFile("src/style.css", style_css()),
  ]
}

pub fn upsert_file(
  files: List(ProjectFile),
  path: String,
  content: String,
) -> List(ProjectFile) {
  let normalized = strip_leading_slashes(path)
  case list.any(files, fn(file) { file.path == normalized }) {
    True ->
      list.map(files, fn(file) {
        case file.path == normalized {
          True -> ProjectFile(normalized, content)
          False -> file
        }
      })
    False ->
      [ProjectFile(normalized, content), ..files]
      |> list.sort(by: fn(a, b) { string.compare(a.path, b.path) })
  }
}

pub fn files_to_tree(files: List(ProjectFile)) -> FileTree {
  Directory(files_to_nodes(files))
}

pub fn tree_get(tree: FileTree, path: String) -> Result(FileTree, Nil) {
  let parts = path |> string.split("/") |> list.filter(fn(part) { part != "" })
  do_tree_get(tree, parts)
}

fn do_tree_get(tree: FileTree, parts: List(String)) -> Result(FileTree, Nil) {
  case tree, parts {
    _, [] -> Ok(tree)
    Directory(children), [part, ..rest] ->
      case list.find(children, fn(child) { child.0 == part }) {
        Ok(child) -> do_tree_get(child.1, rest)
        Error(_) -> Error(Nil)
      }
    File(_), _ -> Error(Nil)
  }
}

fn files_to_nodes(files: List(ProjectFile)) -> List(#(String, FileTree)) {
  case files {
    [] -> []
    [file, ..rest] -> insert_file(files_to_nodes(rest), file)
  }
}

fn insert_file(
  nodes: List(#(String, FileTree)),
  file: ProjectFile,
) -> List(#(String, FileTree)) {
  let parts =
    file.path |> string.split("/") |> list.filter(fn(part) { part != "" })
  insert_parts(nodes, parts, file.content)
}

fn insert_parts(
  nodes: List(#(String, FileTree)),
  parts: List(String),
  content: String,
) -> List(#(String, FileTree)) {
  case parts {
    [] -> nodes
    [name] -> replace_node(nodes, name, File(content))
    [directory, ..rest] -> {
      let existing_children = case
        list.find(nodes, fn(node) { node.0 == directory })
      {
        Ok(#(_, Directory(children))) -> children
        _ -> []
      }
      replace_node(
        nodes,
        directory,
        Directory(insert_parts(existing_children, rest, content)),
      )
    }
  }
}

fn replace_node(
  nodes: List(#(String, FileTree)),
  name: String,
  tree: FileTree,
) -> List(#(String, FileTree)) {
  case list.any(nodes, fn(node) { node.0 == name }) {
    True ->
      list.map(nodes, fn(node) {
        case node.0 == name {
          True -> #(name, tree)
          False -> node
        }
      })
    False -> [#(name, tree), ..nodes]
  }
}

fn strip_leading_slashes(path: String) -> String {
  case string.starts_with(path, "/") {
    True ->
      strip_leading_slashes(string.slice(
        path,
        at_index: 1,
        length: string.length(path),
      ))
    False -> path
  }
}

fn package_json() -> String {
  "{\n  \"scripts\": {\n    \"dev\": \"vite --host 0.0.0.0\"\n  },\n  \"dependencies\": {\n    \"@vitejs/plugin-react\": \"latest\",\n    \"@electric-sql/pglite\": \"latest\",\n    \"vite\": \"latest\",\n    \"typescript\": \"latest\",\n    \"react\": \"latest\",\n    \"react-dom\": \"latest\"\n  },\n  \"devDependencies\": {},\n  \"type\": \"module\"\n}"
}

fn main_tsx() -> String {
  "import React, { useEffect, useState } from 'react'
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
    <section className=\"hero\">
      <p className=\"eyebrow\">Browser app builder MVP</p>
      <h1>Realtime React + PGlite app</h1>
      <p>Ask the agent to change this app. The preview updates from a StackBlitz WebContainer.</p>
    </section>
    <section className=\"card\">
      <h2>Local PGlite notes</h2>
      <div className=\"row\">
        <input value={text} onChange={e => setText(e.target.value)} placeholder=\"Write a note\" />
        <button onClick={addNote}>Add</button>
      </div>
      <ul>{notes.map(note => <li key={note.id}>{note.text}</li>)}</ul>
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
"
}

fn db_ts() -> String {
  "import { PGlite } from '@electric-sql/pglite'

export const db = new PGlite('idb://preview-app')
"
}

fn build_inspector_ts() -> String {
  "const STYLE_ID = 'build-inspector-style'
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

function emitInspectorStatus(type: string) {
  window.parent.postMessage({ type }, '*')
}

emitInspectorStatus('BUILD_INSPECTOR_READY')

function enable() {
  enabled = true
  ensureStyle()
  emitInspectorStatus('BUILD_INSPECTOR_ENABLED')
}

function disable() {
  enabled = false
  clearHover()
  emitInspectorStatus('BUILD_INSPECTOR_DISABLED')
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
  emitInspectorStatus('BUILD_INSPECTOR_CLICK_SEEN')
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
"
}

fn style_css() -> String {
  ":root { color: #162033; background: #f6f8fb; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
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
"
}
