/**
 * Replace the full value of an input/textarea via `insertText` so the change
 * joins the native undo stack (plain `.value =` / v-model assign does not).
 * Returns true when the native path succeeded.
 */
export function replaceEditableValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  next: string,
): boolean {
  if (el.value === next) return true

  el.focus()
  const len = el.value.length
  el.setSelectionRange(0, len)

  if (next === '') {
    return document.execCommand('delete')
  }

  return document.execCommand('insertText', false, next)
}
