"""The narrator's test: one passage read by every voice tried, so they can be compared by ear.

  tools/gen/voice_kokoro.py      Kokoro-82M (Apache 2.0, hexgrad/Kokoro-82M): its stock voices
  tools/gen/voice_chatterbox.py  Chatterbox (MIT, ResembleAI/chatterbox): its own voice, and voices
                                 it takes from a Kokoro sample, read more or less dramatically

The passage is a stand-in, not the story: the opening story's words (IntroCrawl.svelte) are still
being written, and are voiced once they are settled. Takes go to art/audio/voice/<model>/<name>.mp3
(kept out of git, as the sound takes are); nobody here can hear them, James chooses by ear.
"""

PASSAGE = (
    'Every pilot remembers the first jump. The gate charges, the stars stretch into lines, '
    'and for one long breath you belong to nobody. Then the far side opens, cold and bright, '
    'and somebody is already waiting for you.'
)

OUT = 'art/audio/voice'

# the narrator (2026-11-19): Xenophon, an old hired pilot of the game's own world (docs/factions-and-races.md), read by
# ElevenLabs on James's own paid plan in this voice, with a Greek accent; James chose it by ear from test takes.
# tools/gen/narrate.py reads every line in it. (Before, Chatterbox in a voice made from Kokoro's bm_lewis, kept as
# art/audio/narrator/voice.wav.)
NARRATOR = {
    'voice': 'YjbHBTWH8WkGAhNrkp0i',
    'model': 'eleven_v3',
    'style': '[Greek accent]',
    'seed': 7,
}
