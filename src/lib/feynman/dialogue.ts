import type { ExplanationCategory } from './classifier'

export function rohanOpening(skillLabel: string): string {
  return `I've been trying to understand ${skillLabel} and I'm completely lost. You've studied this — can you explain it to me? What even is ${skillLabel}?`
}

export function rohanFollowUp(category: ExplanationCategory, skillLabel: string): string {
  if (category === 'meaning-included') {
    return "Oh, interesting. But I don't see why that connects to anything real yet — can you show me with a concrete example?"
  }
  if (category === 'method-only') {
    return "Okay, I get the steps. But what is that actually doing? What have you found once you're done — what does the answer mean?"
  }
  return `I'm still not following. What does ${skillLabel} actually do — not the steps, the point of it?`
}

export const ROHAN_BREAKDOWN_QUESTION =
  "Wait, but why would you ever need to do this? What's it actually for?"

export function rohanGapCallout(skillLabel: string): string {
  return `You explained the process well — but my question was about meaning.\n\nThe gap: you haven't connected ${skillLabel} to a real situation where it's actually useful.\n\nTry again — give me one real situation where you'd need this, not the steps, the situation.`
}

export function rohanResolution(resolved: boolean): string {
  return resolved
    ? "Oh. That actually makes sense now. Why didn't you just say that the first time?"
    : "I think I sort of see it, but I'm still not all the way there."
}
