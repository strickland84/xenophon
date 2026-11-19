// The interface's sounds (a panel opening and closing, the focus moving, a button pressed, something
// confirmed, refused or bought), for any screen of the page: one player for all of them, made when
// first wanted, playing through the page's mixer once the first click or key has made it.

import type { UiSound } from './cues'
import { createSound } from './sound'
import type { Sound } from './sound'

let player: Sound | null = null

export function uiSound(kind: UiSound) {
  if (typeof window === 'undefined') return
  if (!player) player = createSound()
  player.ui(kind)
}
