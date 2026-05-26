import { describe, expect, it } from 'vitest'
import { filesToTree, starterFiles, upsertFile } from './templates'

describe('project templates', () => {
  it('includes a runnable React/PGlite starter project', () => {
    expect(starterFiles.map(file => file.path)).toEqual(expect.arrayContaining([
      'package.json',
      'index.html',
      'src/main.tsx',
      'src/db.ts',
      'src/style.css',
    ]))
    expect(starterFiles.find(file => file.path === 'src/db.ts')?.content).toContain('@electric-sql/pglite')
  })

  it('converts flat project files into a WebContainer file tree', () => {
    const tree = filesToTree([
      { path: 'package.json', content: '{}' },
      { path: 'src/main.tsx', content: 'console.log(1)' },
    ])

    expect(tree['package.json']).toEqual({ file: { contents: '{}' } })
    expect(tree.src).toEqual({ directory: { 'main.tsx': { file: { contents: 'console.log(1)' } } } })
  })

  it('upserts existing files without changing unrelated files', () => {
    const files = [
      { path: 'a.ts', content: 'old' },
      { path: 'b.ts', content: 'same' },
    ]

    expect(upsertFile(files, '/a.ts', 'new')).toEqual([
      { path: 'a.ts', content: 'new' },
      { path: 'b.ts', content: 'same' },
    ])
  })

  it('adds new files in sorted order', () => {
    expect(upsertFile([{ path: 'z.ts', content: 'z' }], 'a.ts', 'a')).toEqual([
      { path: 'a.ts', content: 'a' },
      { path: 'z.ts', content: 'z' },
    ])
  })
})
