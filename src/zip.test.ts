/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { downloadZip } from './zip'

describe('downloadZip', () => {
  it('creates a zip blob and triggers a browser download', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.fn()
    const anchor = document.createElement('a')
    anchor.click = click
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    await downloadZip([
      { path: 'package.json', content: '{}' },
      { path: 'src/main.tsx', content: 'console.log(1)' },
    ], 'app.zip')

    expect(createElement).toHaveBeenCalledWith('a')
    expect(anchor.href).toBe('blob:test')
    expect(anchor.download).toBe('app.zip')
    expect(click).toHaveBeenCalledOnce()
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
