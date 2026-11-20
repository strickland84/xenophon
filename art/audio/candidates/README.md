# Open music candidates

Music by other people under open licences, gathered to try in place of the game's own (James, 2026-11-20: "I hate the
music we have"). None of it is played by the game. `list.json` says which place each piece is tried for, its title and
who made it; `node tools/audio/candidates.mjs <soundfont.sf2> [<second.sf2>]` renders them into `static/candidates/`
(not in git), and `/sounds` plays them under "Open music to try", the game's own take first in each place.

These files are **not** the project's assets: each keeps its own licence below, and `ASSETS.md` does not cover them.

| Folder        | What                                                                                                    | Licence                                                                  | Credit                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `freedoom/`   | MIDI files from [Freedoom](https://github.com/freedoom/freedoom/tree/master/musics) (its `d_*.mid`)     | BSD 3-clause (`freedoom/COPYING.adoc`)                                   | Contributors to the Freedoom project; each composer in `list.json` |
| `game-game/`  | MIDI files of [Game-Game](https://opengameart.org/content/game-game), an unmade space game's soundtrack | CC-BY-SA 3.0                                                             | Metaruka (submitted by maxstack)                                  |
| `jan125/`     | MIDI files of [Stereotypical 90's space shooter music](https://opengameart.org/content/stereotypical-90s-space-shooter-music) | OGA-BY 3.0                                                               | Jan125                                                            |
| `modarchive/` | Tracker modules from [The Mod Archive](https://modarchive.org/)                                         | public domain (Beyond, ekorren), CC-BY (cs127), as each page says        | the artist in `list.json`                                         |

## Rendering

MIDI holds notes, not sound: a soundfont decides how it sounds. The candidates were rendered through **FluidR3_GM**
(Frank Wen, MIT; Debian's `fluid-soundfont-gm`), with three also through **GeneralUser GS** (S. Christian Collins, free
for any music; its author cannot vouch for where every sample came from) to compare. Avoid soundfonts ripped from
Roland's or others' hardware. Tracker modules carry their own samples and are rendered by ffmpeg's libopenmpt; on The
Mod Archive an uploader's licence does not always cover samples taken from other modules, so a module chosen needs its
samples checked.

Every candidate is evened to −16 LUFS and cut at 3:30 with a fade, so they can be compared with each other and with the
game's own music.

## Not tried

The Ur-Quan Masters' music (CC BY-NC-SA: not for a product), Naev's (recorded audio, its licence not found), OpenTTD's
OpenMSX (GPL, too gentle), MIDI cover sites (covers of others' songs), and the Big MOD Music Pack on itch.io (700+
modules said to be freely licensed, but it holds covers of pop songs; and itch.io refused the download).
