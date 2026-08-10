export function splitExplanationSteps(body: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false

  function flush() {
    const block = current.join('\n').trim()
    if (block) blocks.push(block)
    current = []
  }

  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    if (line.trim().startsWith('```')) inFence = !inFence
    if (!inFence && line.trim() === '') {
      flush()
    } else {
      current.push(line)
    }
  }
  flush()

  return blocks.reduce<string[]>((steps, block) => {
    if (/^#{1,6}\s/.test(block) && steps.length === 0) {
      steps.push(block)
      return steps
    }
    const previous = steps[steps.length - 1]
    if (previous && /^#{1,6}\s[^\n]+$/.test(previous)) {
      steps[steps.length - 1] = `${previous}\n\n${block}`
    } else {
      steps.push(block)
    }
    return steps
  }, [])
}
