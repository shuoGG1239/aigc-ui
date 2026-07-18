export function randomOne<T>(inputs: T[]): T | undefined {
  if (!inputs.length) return undefined
  if (inputs.length === 1) return inputs[0]
  return inputs[Math.floor(Math.random() * inputs.length)]
}
