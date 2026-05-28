import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLineGutter } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'

function languageExtensionsForPath(path) {
  const lower = String(path || '').toLowerCase()
  if (lower.endsWith('.json')) return [json()]
  if (lower.endsWith('.html')) return [html()]
  if (lower.endsWith('.css')) return [css()]
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return [javascript({ jsx: lower.endsWith('.tsx'), typescript: true })]
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return [javascript({ jsx: lower.endsWith('.jsx') })]
  return []
}

class BuildCodeEditor extends HTMLElement {
  connectedCallback() {
    if (this.view) return
    this.classList.add('build-code-editor')
    this.mount = document.createElement('div')
    this.mount.style.height = '100%'
    this.replaceChildren(this.mount)
    this.createView()
  }

  disconnectedCallback() {
    this.view?.destroy()
    this.view = undefined
  }

  static get observedAttributes() { return ['value', 'path', 'readonly'] }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.view || oldValue === newValue) return
    if (name === 'value') this.setContent(newValue ?? '')
    if (name === 'path' || name === 'readonly') this.recreateView()
  }

  createView() {
    const doc = this.getAttribute('value') ?? ''
    const path = this.getAttribute('path') ?? ''
    const readonly = this.getAttribute('readonly') === 'true'
    const onChange = EditorView.updateListener.of(update => {
      if (!update.docChanged || this.applyingExternalValue) return
      const value = update.state.doc.toString()
      this.dispatchEvent(new CustomEvent('change', { detail: value, bubbles: true }))
    })
    this.view = new EditorView({
      parent: this.mount,
      state: EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          oneDark,
          EditorView.lineWrapping,
          EditorView.editable.of(!readonly),
          ...languageExtensionsForPath(path),
          onChange,
        ],
      }),
    })
  }

  recreateView() {
    const value = this.view?.state.doc.toString() ?? this.getAttribute('value') ?? ''
    this.view?.destroy()
    this.view = undefined
    this.setAttribute('value', value)
    if (this.mount) this.createView()
  }

  setContent(value) {
    const current = this.view.state.doc.toString()
    if (current === value) return
    this.applyingExternalValue = true
    this.view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    this.applyingExternalValue = false
  }
}

export function registerBuildEditor() {
  if (!customElements.get('build-code-editor')) customElements.define('build-code-editor', BuildCodeEditor)
}
