import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { languageExtensionsForPath } from './editor'

export function CodeEditor(props: {
  path: string
  value: string
  onChange: (value: string) => void
}) {
  return <CodeMirror
    key={props.path}
    value={props.value}
    height="100%"
    theme={oneDark}
    extensions={[
      ...languageExtensionsForPath(props.path),
      EditorView.lineWrapping,
    ]}
    basicSetup={{
      autocompletion: true,
      bracketMatching: true,
      closeBrackets: true,
      foldGutter: true,
      highlightActiveLine: true,
      highlightSelectionMatches: true,
      lineNumbers: true,
    }}
    onChange={props.onChange}
  />
}
