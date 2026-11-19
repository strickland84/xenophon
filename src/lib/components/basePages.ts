// The base's pages: the buttons in the row at the top of the scene at a friendly base, and the screen they open
// (BaseScreen), one page at a time. The row is the screen's only tabs.

export type BasePage = 'hold' | 'market' | 'supplies'

export const BASE_PAGES: { id: BasePage; label: string; icon: string; line: string }[] = [
  { id: 'hold', label: 'Hold', icon: 'hold', line: "Your ship's hold and the vault: bank what you carry" },
  { id: 'market', label: 'Market', icon: 'market', line: "Sell the ore in your vault at today's prices here" },
  { id: 'supplies', label: 'Supplies', icon: 'supplies', line: 'Repair your hull and buy missiles' },
]
