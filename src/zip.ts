import JSZip from 'jszip'
import type { ProjectFile } from './templates'

export async function downloadZip(files: ProjectFile[], name = 'browser-app.zip') {
  const zip = new JSZip()
  for (const file of files) zip.file(file.path, file.content)
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
