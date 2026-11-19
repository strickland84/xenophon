// Prints every line the narrator reads, as JSON ([{id, text}]), for tools/gen/narrate.py and tools/audio/narration.py
// (they are Python, the words are the game's TypeScript).
//   npx jiti tools/narration-lines.ts
import { NARRATION } from '../src/lib/audio/narration'

console.log(JSON.stringify(NARRATION))
