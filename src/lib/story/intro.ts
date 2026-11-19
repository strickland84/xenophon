// The opening story's words (IntroCrawl.svelte rolls them; the narrator reads them, src/lib/audio/narration.ts), in
// the story's voice (.claude/skills/story-voice). A side's name is
// written {nomarchy:...} or {anarchoi:...} and shown in its colour.

import type { FactionId } from '../save/pilot'

/** the name, as the narrator says it: as the name is lit, and on the title page */
export const TITLE_LINE = 'Xenophon: Twin Stars.'

export const OPENING = 'Between a gold sun and a red one lie forty worlds.'
// (James, 2026-11-19: the story before this one was lore and no context. It is told as the old film serials told
// theirs: what is happening now, what just happened, and a pilot at the start of it, where the first sortie begins.)
export const STORY: { mark?: FactionId; text: string }[] = [
  {
    text: 'The war for the forty worlds has flared again. {nomarchy:Nomarchy} and {anarchoi:Anarchoi} squadrons are fighting over Drassel, in the core, for the third time this year.',
  },
  {
    text: "Both sides pay well for ore, and raiders have learned that a ship shot down over open ground spills its hold for anyone to pick up. Ore is nobody's until it is banked at a friendly base.",
  },
  {
    text: 'A world goes to the side with the most flags on its outpost mast, and both sides are short of pilots.',
  },
  {
    mark: 'nomarchy',
    text: '{nomarchy:The Nomarchy} has opened its hangars on the {nomarchy:Meridian Ring} to anyone who will sign its register.',
  },
  {
    mark: 'anarchoi',
    text: '{anarchoi:The Anarchoi} are handing out ships on the {anarchoi:Raft} to anyone who turns up.',
  },
  { text: 'At the dock, a new pilot sits in a cold ship, waiting for clearance to launch...' },
]

/** a paragraph as runs of words, each in its colour (null: the ink) */
export function runsOf(text: string): { words: string; side: FactionId | null }[] {
  const out: { words: string; side: FactionId | null }[] = []
  let at = 0
  for (const m of text.matchAll(/\{(nomarchy|anarchoi):([^}]+)\}/g)) {
    if (m.index! > at) out.push({ words: text.slice(at, m.index), side: null })
    out.push({ words: m[2], side: m[1] as FactionId })
    at = m.index! + m[0].length
  }
  if (at < text.length) out.push({ words: text.slice(at), side: null })
  return out
}

/** a paragraph as it is read aloud: its words, without the colours' marks */
export const plain = (text: string) =>
  runsOf(text)
    .map((r) => r.words)
    .join('')
