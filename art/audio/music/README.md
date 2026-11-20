# The game's music

The game's music is other people's, under open licences: MIDI files rendered through a General MIDI soundfont, and a
few tracker modules, the way games of the early 1990s sounded (James, 2026-11-20: "I hate the music we have", then of
these, "these are all better"). `list.json` says which place (`src/lib/audio/moods.ts`) or sting each piece plays in,
its title and who made it; the game plays every piece of a place in turn.

    node tools/audio/music.mjs <FluidR3_GM.sf2>    renders them all into static/audio/music/<place>_<n>.ogg
    node tools/audio/music.mjs --table             only src/lib/audio/pieces.ts and the licences again

MIDI is played by SpessaSynth through **FluidR3_GM** (Frank Wen, MIT; `apt download fluid-soundfont-gm`, then
`dpkg-deb -x` it); modules by ffmpeg's libopenmpt with their own samples. Each is evened to −16 LUFS and cut at 3:30 with
a fade, Opus at 64 kbps. To add a piece, put its file in the folder of its source (a new source needs its licence
checked and an entry in `sources`), list it, and run the tool.

These files are **not** the project's assets: each keeps its own licence below, and `ASSETS.md` does not cover them. The
game names every source, its licence and its composers in Settings, Sound (`SettingsScreen.svelte`, from
`pieces.ts SOURCES` and `CREDITS`), and serves Freedoom's licence at `/licences/freedoom.txt`.

| Folder        | What                                                                                                                          | Licence                                                  | Credit                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `freedoom/`   | MIDI files from [Freedoom](https://github.com/freedoom/freedoom/tree/master/musics) (its `d_*.mid`)                           | BSD 3-clause (`freedoom/COPYING.adoc`)                   | Contributors to the Freedoom project; each composer in `list.json`  |
| `game-game/`  | MIDI files of [Game-Game](https://opengameart.org/content/game-game), an unmade space game's soundtrack                       | CC-BY-SA 3.0 (its renders are CC-BY-SA 3.0 too)          | Metaruka (submitted by maxstack)                                    |
| `jan125/`     | MIDI files of [Stereotypical 90's space shooter music](https://opengameart.org/content/stereotypical-90s-space-shooter-music) | OGA-BY 3.0                                               | Jan125                                                              |
| `modarchive/` | Tracker modules from [The Mod Archive](https://modarchive.org/)                                                               | public domain (Beyond, ekorren), CC-BY (cs127), each page | the artist in `list.json`                                           |

On The Mod Archive an uploader's licence does not always cover samples taken from other modules; Beyond's modules use
some from others' (`bnd-spaceexploration.it` names experience.xm and dystopia.xm). Not used: the Ur-Quan Masters' music
(CC BY-NC-SA), Naev's (licence not found), OpenTTD's OpenMSX (too gentle), MIDI cover sites, and the Big MOD Music Pack
on itch.io (it holds covers of pop songs).
