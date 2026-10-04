export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for non-secure contexts where the Clipboard API is unavailable.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}
