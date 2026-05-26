export type SelectedPreviewElement = {
  tagName: string
  id: string
  classes: string[]
  textContent: string
  outerHTML: string
  boundingRect: { x: number; y: number; width: number; height: number }
  computedStyles: Record<string, string>
}

export type SelectedElementMessage = {
  type: 'BUILD_ELEMENT_SELECTED'
  element: SelectedPreviewElement
}

export function isSelectedElementMessage(value: unknown): value is SelectedElementMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SelectedElementMessage>
  const element = candidate.element as Partial<SelectedPreviewElement> | undefined
  return candidate.type === 'BUILD_ELEMENT_SELECTED'
    && !!element
    && typeof element.tagName === 'string'
    && typeof element.id === 'string'
    && Array.isArray(element.classes)
    && typeof element.textContent === 'string'
    && typeof element.outerHTML === 'string'
    && !!element.boundingRect
    && typeof element.computedStyles === 'object'
}

export function summarizeSelectedElement(element: SelectedPreviewElement) {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const className = element.classes[0] ? `.${element.classes[0]}` : ''
  return `${tag}${id}${className}`
}

export function buildSelectedElementPrompt(args: { comment: string; element: SelectedPreviewElement }) {
  const { element, comment } = args
  return `Improve the selected preview element based on the user's comment.

User comment:
${comment}

Selected rendered element:
Summary: ${summarizeSelectedElement(element)}
Tag: ${element.tagName}
ID: ${element.id || '(none)'}
Classes: ${element.classes.join(' ') || '(none)'}
Text: ${element.textContent || '(none)'}
Bounds: ${JSON.stringify(element.boundingRect)}
Computed styles: ${JSON.stringify(element.computedStyles, null, 2)}
Outer HTML:
${element.outerHTML}

Update the source files that render and style this selected element. Preserve the Build inspector import and src/build-inspector.ts.`
}
