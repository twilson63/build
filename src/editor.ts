import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import type { Extension } from '@codemirror/state'

export function languageExtensionsForPath(path: string): Extension[] {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json')) return [json()]
  if (lower.endsWith('.html')) return [html()]
  if (lower.endsWith('.css')) return [css()]
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return [javascript({ jsx: lower.endsWith('.tsx'), typescript: true })]
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return [javascript({ jsx: lower.endsWith('.jsx') })]
  return []
}
