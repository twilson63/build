import type { SelectedPreviewElement } from '../preview-inspector'

export type PreviewState = {
  readonly previewUrl: string
  readonly selectingElement: boolean
  readonly selectedElement: SelectedPreviewElement | null
  readonly elementComment: string
}

export type PreviewMsg =
  | { type: 'preview_url_changed'; url: string }
  | { type: 'element_select_toggled' }
  | { type: 'element_selected'; element: SelectedPreviewElement }
  | { type: 'element_comment_changed'; comment: string }
  | { type: 'element_cleared' }

export type PreviewEffect =
  | { type: 'post_inspector_message'; message: 'BUILD_INSPECTOR_ENABLE' | 'BUILD_INSPECTOR_DISABLE' }

export function init(): PreviewState {
  return { previewUrl: '', selectingElement: false, selectedElement: null, elementComment: '' }
}

export function update(state: PreviewState, msg: PreviewMsg): [PreviewState, PreviewEffect[]] {
  switch (msg.type) {
    case 'preview_url_changed':
      return [{ ...state, previewUrl: msg.url }, state.selectingElement ? [{ type: 'post_inspector_message', message: 'BUILD_INSPECTOR_ENABLE' }] : []]
    case 'element_select_toggled':
      return [{ ...state, selectingElement: !state.selectingElement }, [{ type: 'post_inspector_message', message: state.selectingElement ? 'BUILD_INSPECTOR_DISABLE' : 'BUILD_INSPECTOR_ENABLE' }]]
    case 'element_selected':
      return [{ ...state, selectedElement: msg.element, elementComment: '', selectingElement: false }, [{ type: 'post_inspector_message', message: 'BUILD_INSPECTOR_DISABLE' }]]
    case 'element_comment_changed':
      return [{ ...state, elementComment: msg.comment }, []]
    case 'element_cleared':
      return [{ ...state, selectedElement: null, elementComment: '' }, []]
    default: {
      const _exhaustive: never = msg
      return [state, []]
    }
  }
}
