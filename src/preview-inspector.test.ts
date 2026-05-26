import { describe, expect, it } from 'vitest'
import { buildSelectedElementPrompt, isSelectedElementMessage, summarizeSelectedElement, type SelectedPreviewElement } from './preview-inspector'

const element: SelectedPreviewElement = {
  tagName: 'BUTTON',
  id: 'cta',
  classes: ['primary', 'large'],
  textContent: 'Start now',
  outerHTML: '<button id="cta" class="primary large">Start now</button>',
  boundingRect: { x: 1, y: 2, width: 100, height: 40 },
  computedStyles: { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(0, 0, 0)' },
}

describe('preview inspector helpers', () => {
  it('validates selected element messages', () => {
    expect(isSelectedElementMessage({ type: 'BUILD_ELEMENT_SELECTED', element })).toBe(true)
    expect(isSelectedElementMessage({ type: 'BUILD_ELEMENT_SELECTED' })).toBe(false)
    expect(isSelectedElementMessage({ type: 'OTHER', element })).toBe(false)
  })

  it('summarizes selected elements', () => {
    expect(summarizeSelectedElement(element)).toBe('button#cta.primary')
    expect(summarizeSelectedElement({ ...element, id: '', classes: [] })).toBe('button')
    expect(summarizeSelectedElement({ ...element, id: '', classes: ['card'] })).toBe('button.card')
  })

  it('builds selected element prompt context', () => {
    const prompt = buildSelectedElementPrompt({ comment: 'Make it calmer', element })
    expect(prompt).toContain('User comment')
    expect(prompt).toContain('Make it calmer')
    expect(prompt).toContain('button#cta.primary')
    expect(prompt).toContain(element.outerHTML)
    expect(prompt).toContain('Computed styles')
  })
})
