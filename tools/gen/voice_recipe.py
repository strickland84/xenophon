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
# ElevenLabs on James's own paid plan. Since the second search the same day (James: "find a better elevenlabs voice"),
# Theos, a Greek narrator for documentaries and trailers, told to keep a Greek accent in English: of ten voices tried
# (tools/gen/voice_eleven.py, measured by tools/audio/voice_check.py) the deepest (a median of 77 Hz) and among the
# slowest (118 words a minute), every word made out, the accent plain but easy to follow. The first, Miltiadis
# (YjbHBTWH8WkGAhNrkp0i), read at 159 words a minute and was heard by Whisper as more Greek than English.
# tools/gen/narrate.py reads every line in it.
NARRATOR = {
    'voice': 'n0vzWypeCK1NlWPVwhOc',
    'model': 'eleven_v3',
    'style': '[Greek accent]',
    'seed': 7,
}
