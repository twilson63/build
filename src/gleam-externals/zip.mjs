function gleamListToArray(list) {
  return typeof list?.toArray === 'function' ? list.toArray() : []
}

function normalizeFiles(files) {
  return gleamListToArray(files).map(file => ({ path: file.path, content: file.content }))
}

export async function exportProjectZip(filesArg) {
  const files = normalizeFiles(filesArg)
  try {
    const { downloadZip } = await import('../zip')
    await downloadZip(files)
  } catch {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    for (const file of files) zip.file(file.path, file.content)
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'browser-app.zip'
    anchor.click()
    URL.revokeObjectURL(url)
  }
}
