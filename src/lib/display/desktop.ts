// Whether this is a desktop the game can be played on (James, 2026-11-19: "this game is now purely intended for desktop
// mouse and keyboard. If someone is on a narrow device like that just point them to the github and tell them to get a
// PC"): a mouse, or something that points as finely as one, and a screen at least DESKTOP_WIDE across its long side. A
// phone has neither; a tablet has no mouse unless one is plugged in. `?desktop=yes` lets a tool or a developer past.

/** px (CSS): the long side of the smallest screen the game is laid out for */
export const DESKTOP_WIDE = 1024

export function isDesktop(query?: { get(key: string): string | null }): boolean {
  if (typeof window === 'undefined') return true
  if (query?.get('desktop') === 'yes') return true
  const fine = window.matchMedia?.('(any-pointer: fine)').matches ?? true
  const wide = Math.max(window.screen.width, window.screen.height) >= DESKTOP_WIDE
  return fine && wide
}
