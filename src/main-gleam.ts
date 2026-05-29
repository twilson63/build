import { registerBuildEditor } from './gleam-externals/editor.mjs'
import { dispatchBuildFromPlan, dispatchPreviewElementSelected } from '../build/dev/javascript/build/gleam-externals/runtime_bridge.mjs'
import { registerBuildTerminal } from './gleam-externals/terminal.mjs'
import { main } from '../build/dev/javascript/build/build_app.mjs'

registerBuildEditor()
registerBuildTerminal()
window.addEventListener('message', event => {
  if (event.data?.type === 'BUILD_ELEMENT_SELECTED') dispatchPreviewElementSelected(event.data.element)
  if (event.data?.type === 'BUILD_APP_FROM_PLAN') dispatchBuildFromPlan(event.data.planSummary ?? '')
  if (typeof event.data?.type === 'string' && event.data.type.startsWith('BUILD_INSPECTOR_')) {
    ;(window as typeof window & { __buildInspectorEvents?: string[] }).__buildInspectorEvents = [
      ...((window as typeof window & { __buildInspectorEvents?: string[] }).__buildInspectorEvents ?? []),
      event.data.type,
    ]
  }
})
main()
