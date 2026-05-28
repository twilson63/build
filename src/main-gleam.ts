import { registerBuildEditor } from './gleam-externals/editor.mjs'
import { dispatchPreviewElementSelected } from './gleam-externals/runtime_bridge.mjs'
import { registerBuildTerminal } from './gleam-externals/terminal.mjs'
import { main } from '../build/dev/javascript/build/build_app.mjs'

registerBuildEditor()
registerBuildTerminal()
window.addEventListener('message', event => {
  if (event.data?.type === 'BUILD_ELEMENT_SELECTED') dispatchPreviewElementSelected(event.data.element)
  if (typeof event.data?.type === 'string' && event.data.type.startsWith('BUILD_INSPECTOR_')) {
    ;(window as typeof window & { __buildInspectorEvents?: string[] }).__buildInspectorEvents = [
      ...((window as typeof window & { __buildInspectorEvents?: string[] }).__buildInspectorEvents ?? []),
      event.data.type,
    ]
  }
})
main()
