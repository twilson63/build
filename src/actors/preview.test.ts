import { describe, expect, it } from 'vitest'
import { init, update } from './preview'
import type { SelectedPreviewElement } from '../preview-inspector'

const element: SelectedPreviewElement = { tagName: 'BUTTON', id: '', classes: [], textContent: 'Save', outerHTML: '<button>Save</button>', boundingRect: { x: 0, y: 0, width: 10, height: 10 }, computedStyles: {} }

describe('preview actor', () => {
  it('toggles inspector messages', () => {
    const [on, enable] = update(init(), { type: 'element_select_toggled' })
    expect(on.selectingElement).toBe(true)
    expect(enable).toEqual([{ type: 'post_inspector_message', message: 'BUILD_INSPECTOR_ENABLE' }])
    const [off, disable] = update(on, { type: 'element_select_toggled' })
    expect(off.selectingElement).toBe(false)
    expect(disable).toEqual([{ type: 'post_inspector_message', message: 'BUILD_INSPECTOR_DISABLE' }])
  })

  it('selects an element, clears comment, and disables inspector', () => {
    const [next, effects] = update({ ...init(), selectingElement: true, elementComment: 'x' }, { type: 'element_selected', element })
    expect(next).toMatchObject({ selectingElement: false, selectedElement: element, elementComment: '' })
    expect(effects).toEqual([{ type: 'post_inspector_message', message: 'BUILD_INSPECTOR_DISABLE' }])
  })

  it('re-enables inspector when url changes during selection', () => {
    const [, effects] = update({ ...init(), selectingElement: true }, { type: 'preview_url_changed', url: 'http://x' })
    expect(effects).toEqual([{ type: 'post_inspector_message', message: 'BUILD_INSPECTOR_ENABLE' }])
  })
})
