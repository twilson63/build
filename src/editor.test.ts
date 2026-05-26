import { describe, expect, it } from 'vitest'
import { languageExtensionsForPath } from './editor'

describe('languageExtensionsForPath', () => {
  it.each(['package.json', 'index.html', 'src/style.css', 'src/main.tsx', 'src/util.ts', 'src/app.jsx', 'src/app.js'])('returns an extension for %s', path => {
    expect(languageExtensionsForPath(path).length).toBeGreaterThan(0)
  })

  it('returns no language extension for unknown files', () => {
    expect(languageExtensionsForPath('README.md')).toEqual([])
  })
})
