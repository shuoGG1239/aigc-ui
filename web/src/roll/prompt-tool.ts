export function joinPrompts(...args: Array<string | string[] | undefined | null>): string {
  return joinPromptsList(...args).join(',')
}

export function joinPromptsList(...args: Array<string | string[] | undefined | null>): string[] {
  const list: string[] = []
  for (const a of args) {
    if (typeof a === 'string' && a) list.push(a)
    else if (Array.isArray(a)) list.push(...a.filter(Boolean))
  }
  return list
}

export function prettyPrompt(prompt: string): string {
  return prompt
    .replace(/\n/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '')
}
