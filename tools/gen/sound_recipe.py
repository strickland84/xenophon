"""The recipe for every sound effect and every piece of music in the game (polish pass, item 9).

Each sound is a subject in plain words followed by one shared style (STYLE), so the whole set
comes out belonging together: change the style here, never a single prompt. Each piece of music
is laid out section by section, led by one shared style of its own (SCORE).

  tools/gen/sounds.py       draws the effects with Stable Audio 3 (small, sound effects) in ComfyUI
  tools/gen/music.py        writes the music with ElevenLabs Music (James's key; the one service off this PC)
  tools/audio/pack.py       measures every take, chooses, and puts the chosen ones into the game

Choosing: unless a sound says `use`, tools/audio/pack.py picks the best-measured takes (one, or
`variants` of them for a sound heard over and over, which the game takes turns with). Nobody can
hear on the machine that made these, so `use` is how James's ears overrule it: "the cannon is weak,
use take 3" is `use=[3]` on the cannon. Takes are numbered from 1, as on the sampler page (/sounds).
"""

# how a sound is cut from what the model gives (tools/gen/sounds.py shape):
#   shot   one event: from its first bang to before a second one, the tail faded
#   tail   from the first bang, keeping the tail (explosions, thunder, a jump)
#   swell  from the first sound, keeping a slow rise (a gate charging, an engine spooling)
#   loop   a steady stretch, its end blended into its start so that it repeats without a seam
SHOT, TAIL, SWELL, LOOP = "shot", "tail", "swell", "loop"

# the shared style every effect's subject is put into
STYLE = "{subject}. Sci-fi space game sound effect, clean, crisp and punchy, high quality, close, no music, no voices. Length: {seconds} seconds."


class Sound:
    def __init__(self, group, label, cut, seconds, keep, subject, takes=4, variants=1, use=None, style=None, hum=0, new=False, blend=0.5):
        self.group = group  # where the sampler page lists it
        self.label = label  # what it is, in plain words
        self.cut = cut
        self.seconds = seconds  # how long the model is asked for
        self.keep = keep  # the longest the game's file may be (a loop: exactly this long)
        self.subject = subject
        self.takes = takes
        self.variants = variants  # how many takes the game takes turns with
        self.use = use  # the takes chosen by ear, overruling the measurements (None: by measurement)
        self.style = style or STYLE  # the shared style it is put into (the engines have their own)
        self.hum = hum  # an engine's hum: the most like noise it may be (0: not a hum), measured for whine and hiss too (pack.py hum_shape)
        self.new = new  # made since James last listened: marked new on the sampler page
        self.blend = blend  # a loop: seconds of its end mixed into its start (tools/gen/sounds.py make_loop)

    def prompt(self):
        return self.style.format(subject=self.subject, seconds=int(round(self.seconds)))


ENGINES, GUNS, HITS, PILOT, FOOT, TRADE, SPACE, PLACES, ALARMS, UI = (
    "Engines",
    "Guns and missiles",
    "Hits and explosions",
    "The pilot",
    "On foot",
    "Mining, cargo and trade",
    "Space travel",
    "Places and weather",
    "Alarms",
    "Interface",
)

# The engines (made again 2026-11-18: James heard the first ones, "a clear steady mid-pitched turbine whine" idling and
# "a smooth whooshing roar" cruising, as "terrible, like a whining repeating wind noise", four seconds going round). Now
# the drives of hard science-fiction ships: a deep, smooth hum with a body of tones and a slow throb, in their own shared
# style (the effects' "crisp and punchy" is for bangs), twelve seconds a loop. Three sizes by the size of the engine
# (src/lib/audio/cues.ts says which hull is which) and three layers: the hum of a drive powered and at rest, the thrust
# that rises with the throttle, and the boost of the thrusters over both; and a drive powering up and down.
# Found by drawing takes and measuring them (tools/audio/pack.py hum_shape), since nobody here can listen: "roar",
# "rumble", "loud" and "powerful" in a state's words gave low-passed noise (a wind an octave down, `noise` 0.6 to 0.75);
# "humming drone" gave a hum of tones (0.1 to 0.4) in most takes. Each is chosen from eight.
DRIVE_STYLE = (
    "{subject}. Deep low sci-fi spaceship engine ambience heard from inside the hull, warm bass rumble, no high whine, "
    "no hiss, no wind, no music, no voices. Length: {seconds} seconds."
)
# The boost of the thrusters, its own style (2026-11-18: James, "there is no engine sound for boosting with Shift"). In the
# drives' style every boost take lay under 150 Hz, nothing from 600 Hz up within 44 dB: a laptop's or a phone's speaker
# gives none of that, so Shift sounded like nothing at all. A thruster's burn is a roar, rough by nature (allowed to be
# like noise), but with its weight in the middle, where a small speaker plays it, and still no hiss and no whine.
BOOST_STYLE = (
    "{subject}. Sci-fi spaceship thrusters at full burn heard from inside the cockpit: a powerful steady roaring rush of "
    "exhaust with a throaty mid-range growl and a gritty crackle, no high whine, no hiss, no music, no voices. "
    "Length: {seconds} seconds."
)
BOOST_SUBJECTS = {
    "light": "A small fast fighter's thrusters opened all the way, a hard throaty roar",
    "medium": "A gunship's twin thrusters opened all the way, a full throaty roar",
    "heavy": "A huge freighter's main thrusters opened all the way, a deep thundering roar",
}

DRIVE_SIZES = {
    "light": "A small fast fighter's compact fusion drive",
    "medium": "A gunship's twin fusion drives",
    "heavy": "A huge freighter's massive reactor drives",
}
# each state: its words on the sampler page, its subject, and how like noise it may be (pack.py hum_shape `noise`: the
# boost is a roar over the hum, so it may be rougher)
DRIVE_STATES = {
    "idle": ("idle", "idling, a low smooth humming drone with a soft slow pulse, even and constant", 0.5),
    "thrust": ("thrust", "under steady thrust, a deeper fuller humming drone with a steady throbbing pulse and a soft turbine tone, even and constant", 0.5),
    "boost": ("boost", "at full afterburn, a heavy humming drone with a rumbling roar and a low crackle, even and constant", 0.65),
}

SOUNDS = {
    **{
        f"drive_{size}_{state}": Sound(ENGINES, f"{size} drive, {words}", LOOP, 20, 12, f"{who} {how}", takes=8, style=DRIVE_STYLE,
                                       hum=rough, new=True, blend=1.5)
        for size, who in DRIVE_SIZES.items()
        for state, (words, how, rough) in DRIVE_STATES.items()
        if state != "boost"
    },
    **{
        f"drive_{size}_boost": Sound(ENGINES, f"{size} drive, boost", LOOP, 20, 12, subject, takes=8, style=BOOST_STYLE, hum=0.95,
                                     new=True, blend=1.5)
        for size, subject in BOOST_SUBJECTS.items()
    },
    "power_up": Sound(ENGINES, "a drive powering up", SWELL, 4, 3.0,
                      "A spaceship's fusion drive powering up from silence, a deep hum spooling up and rising in pitch to a steady humming drone",
                      takes=8, style=DRIVE_STYLE, new=True),
    "power_down": Sound(ENGINES, "a drive powering down", TAIL, 4, 3.0,
                        "A spaceship's fusion drive shutting down, a deep humming drone winding down and falling in pitch to silence",
                        takes=8, style=DRIVE_STYLE, new=True),
    "cruise_drive": Sound(SPACE, "the cruise drive running", LOOP, 8, 4,
                          "A spaceship's cruise drive running at full speed, a deep pulsing throb with a shimmering high whine and rushing wind, constant, unchanging", takes=3),
    # ── guns and missiles
    "cannon": Sound(GUNS, "cannon, one shot", SHOT, 2, 0.45,
                    "A single shot from a spaceship's rapid-fire energy autocannon, a hard punchy thump with a bright crackling zap, one shot only", variants=3),
    "flak": Sound(GUNS, "flak pod, one burst", SHOT, 2, 0.8,
                  "A single burst from a spaceship's flak cannon, a deep heavy thud with a scattering crackle of shrapnel, one shot only", variants=2),
    "laser_pulse": Sound(GUNS, "mining laser fired at a ship", SHOT, 2, 0.4,
                         "A single short pulse of a mining laser fired at a target, a sizzling electric buzz zap, one pulse only", variants=2),
    "mining_laser": Sound(GUNS, "mining laser cutting ore", LOOP, 8, 3,
                          "A mining laser cutting into rock, a steady harsh buzzing electric hum with crackling sizzle and grinding stone, constant, unchanging", takes=3),
    "missile_launch": Sound(GUNS, "missile launched", TAIL, 3, 1.8,
                            "A missile launching from a spaceship's rail, a sharp clunk and a hissing rocket roar rushing away, one launch only"),
    "lock_tick": Sound(GUNS, "missile lock building, one beep", SHOT, 1, 0.12,
                       "One short high electronic targeting beep from a fighter cockpit's missile lock computer, a single beep"),
    "lock_tone": Sound(GUNS, "missile locked, steady tone", LOOP, 4, 1.5,
                       "A fighter cockpit's steady high electronic missile lock tone, one continuous pure tone, constant, unchanging", takes=3),
    "locked": Sound(GUNS, "missile lock made", SHOT, 1, 0.5,
                    "A fighter cockpit's computer confirming a missile lock, a quick bright double electronic beep"),
    "no_lock": Sound(GUNS, "missile refused: nothing locked", SHOT, 1, 0.4,
                     "A fighter cockpit's computer refusing, a short low electronic error buzz"),
    "mine_drop": Sound(GUNS, "mine dropped", SHOT, 2, 0.8,
                       "A space mine released from a ship, a heavy metallic clunk then a small electronic arming beep"),
    "overheat": Sound(GUNS, "guns jammed from heat", TAIL, 2, 1.2,
                      "An overheated spaceship cannon jamming, a hissing burst of venting steam and a metallic clunk"),
    "dodged": Sound(GUNS, "missile shaken off by a roll", TAIL, 2, 1.0,
                    "A missile streaking past very close and missing, a fast whooshing roar flying by"),
    # ── hits and explosions
    "hit_hull": Sound(HITS, "a hit on the hull", SHOT, 2, 0.5,
                      "A heavy energy bolt striking a spaceship's armoured hull, a hard metallic clang and crunch with crackling sparks", variants=3),
    "hit_shield": Sound(HITS, "a hit on the shield", SHOT, 2, 0.5,
                        "A shot striking a spaceship's energy shield, a bright fizzing electric zap with a resonant shimmer", variants=2),
    "shield_down": Sound(HITS, "shield gives out", TAIL, 2, 1.4,
                         "A spaceship's energy shield failing and collapsing, a descending electric whine that shatters with crackling static"),
    "shield_up": Sound(HITS, "shield recharging", SWELL, 2, 1.4,
                       "A spaceship's energy shield recharging and coming back online, a smooth rising electric hum that ends in a soft chime"),
    "explosion_small": Sound(HITS, "small explosion (a missile, a mine)", TAIL, 3, 1.6,
                             "A missile warhead exploding in the air, a sharp punchy blast with a crackle of fire", variants=2),
    "explosion_large": Sound(HITS, "large explosion (a ship)", TAIL, 5, 3.5,
                             "A spaceship blowing apart, a huge deep explosion with a sharp crack, roaring fire and metal debris scattering", variants=2),
    # ── the pilot
    "eject": Sound(PILOT, "ejection seat fires", TAIL, 3, 1.5,
                   "A fighter pilot's ejection seat firing, a sharp explosive bang of the canopy blowing off and a rocket whoosh rising"),
    "down_parachute": Sound(PILOT, "coming down: a Solari's parachute opens", TAIL, 2, 1.4,
                            "A parachute opening, a sudden snapping flap of nylon fabric catching the wind, then wind rushing"),
    "down_wingsuit": Sound(PILOT, "coming down: a Kestrin spreads his wingsuit", SWELL, 2, 1.6,
                           "A wingsuit flyer spreading his arms in freefall, a rushing roar of wind with rippling fluttering fabric"),
    "down_rotor": Sound(PILOT, "coming down: an Orrin's rotor spins up", SWELL, 2, 1.6,
                        "A small personal rotor pack spinning up in the air, a fast whirring of little blades rising to a steady buzz"),
    "down_shell": Sound(PILOT, "coming down: a Skarn curls in his shell", TAIL, 2, 1.4,
                        "Hard armoured shell plates clacking shut as a creature curls into a ball, then wind rushing past as it tumbles"),
    "down_cloak": Sound(PILOT, "coming down: a Noctil opens his wing-cloak", TAIL, 2, 1.4,
                        "Huge soft moth wings unfurling and beating once, a deep soft fluttering whoomph of wind"),
    "down_cap": Sound(PILOT, "coming down: a Thallin's cap opens", TAIL, 2, 1.4,
                      "A big mushroom cap puffing open like a parachute, a soft muffled whoomp with a dusty puff of air"),
    "touchdown": Sound(PILOT, "down on the ground after ejecting", SHOT, 2, 0.8,
                       "A heavy body landing hard on the ground after a fall, a deep thud with a scuff of dirt"),
    "die": Sound(PILOT, "killed on foot", TAIL, 2, 1.4,
                 "A sharp impact then a heavy body collapsing onto the ground, no voice"),
    "pickup": Sound(PILOT, "a new ship: systems online", SWELL, 2, 1.6,
                    "A spaceship cockpit powering up as the pilot takes his seat, a rising electronic whir of systems coming online and a soft confirmation chime"),
    "call": Sound(PILOT, "a ship called on the radio", SHOT, 2, 0.8,
                  "A short double radio chirp and crackle from a handheld radio as a pilot calls in his ship"),
    "climb_out": Sound(PILOT, "canopy opens, climbing out", TAIL, 2, 1.2,
                       "A spaceship cockpit canopy hissing open, a pneumatic hiss and a mechanical clunk"),
    "climb_in": Sound(PILOT, "climbing in, canopy shuts", TAIL, 2, 1.3,
                      "A pilot climbing into a cockpit and the canopy closing, a metallic clunk and a pneumatic hiss sealing shut"),
    # ── on foot
    "step_soft": Sound(FOOT, "footstep on grass and earth", SHOT, 1, 0.35, "One footstep of a boot on dry grass and twigs, a single crisp bright crunch and rustle, close, no low thump", takes=8, variants=4),
    "step_sand": Sound(FOOT, "footstep on sand", SHOT, 1, 0.35, "One footstep of a boot in dry sand, a single soft crunchy step", takes=8, variants=4),
    "step_rock": Sound(FOOT, "footstep on rock and gravel", SHOT, 1, 0.35, "One footstep of a boot on loose gravel and rock, a single crunchy step", takes=8, variants=4),
    "step_snow": Sound(FOOT, "footstep in snow", SHOT, 1, 0.4, "One footstep of a boot in deep crisp snow, a single creaky crunch", takes=8, variants=4),
    "step_metal": Sound(FOOT, "footstep on a metal deck", SHOT, 1, 0.35, "One footstep of a boot on a metal deck plate, a single hard clank", takes=8, variants=4),
    "wade": Sound(FOOT, "a step through shallow water", SHOT, 1, 0.5, "One step wading through shallow water, a single splash", variants=3),
    "dive": Sound(FOOT, "diving to the side", TAIL, 2, 0.8, "A person diving and rolling on the ground, a quick rush of movement and a skidding thud in the dirt"),
    "blaster": Sound(FOOT, "sidearm, one shot", SHOT, 2, 0.5, "A single shot from a small sci-fi energy pistol, a short sharp laser zap, one shot only", variants=2),
    "cutter": Sound(FOOT, "hand cutter cutting a vein", LOOP, 8, 3,
                    "A handheld plasma cutter slicing into rock, a steady hissing buzz with crackling sparks, constant, unchanging", takes=3),
    "flare": Sound(FOOT, "a flare goes up", TAIL, 3, 2.0, "A signal flare fired into the sky, a pop and a rising fizzing whoosh, then a crackling burn"),
    "beacon": Sound(FOOT, "a beacon planted", TAIL, 2, 1.5, "A metal beacon stake driven into the ground, a solid clank and then a clear electronic ping"),
    # ── mining, cargo and trade
    "chunk": Sound(TRADE, "a chunk of ore cracks off", SHOT, 2, 0.5, "A chunk of rock cracking off and breaking away, a sharp stony crack with small falling pebbles", takes=8, variants=3),
    "scoop": Sound(TRADE, "ore scooped into the hold", SHOT, 2, 0.5, "Lumps of ore sucked into a ship's cargo hold, a quick rattling clatter of rocks down a metal chute", variants=2),
    "hold_full": Sound(TRADE, "the hold is full", SHOT, 1, 0.5, "A short low double buzz from a computer, a cargo hold full warning"),
    "crate": Sound(TRADE, "a crate opened and taken", TAIL, 2, 1.0, "A metal supply crate's lid unlatched and opened, a clunk and a creak"),
    "bank": Sound(TRADE, "the hold banked", TAIL, 2, 1.4, "Credits paid into an account, a bright futuristic electronic cash register chime with coins"),
    "buy": Sound(TRADE, "something bought", SHOT, 2, 0.9, "A purchase made at a sci-fi shop terminal, a quick satisfying electronic ka-ching"),
    "brake": Sound(TRADE, "braking to land", TAIL, 2, 1.4, "A spaceship's retro thrusters firing to slow down for landing, a falling whooshing roar"),
    "land": Sound(TRADE, "landing: the legs take the weight", TAIL, 2, 1.4,
                  "A spaceship's landing legs touching down on a pad, a heavy hydraulic thump and creak with the engines spooling down"),
    "lift": Sound(TRADE, "take-off", SWELL, 3, 2.5, "A spaceship lifting off a landing pad, its engines spooling up from a hum to a powerful roar"),
    # ── space travel
    "spool": Sound(SPACE, "cruise drive spooling", SWELL, 2, 1.6, "A spaceship's cruise drive spooling up, a rising electric whine climbing in pitch"),
    "cruise_punch": Sound(SPACE, "cruise drive engages", TAIL, 3, 2.2, "A spaceship's cruise drive engaging, a deep heavy thump and a surge of rushing power"),
    "dock": Sound(SPACE, "docking at a station", TAIL, 3, 1.8,
                  "A spaceship docking at a space station, heavy docking clamps clanking shut and a hiss of air pressurising"),
    "breakout": Sound(SPACE, "climbing out of the air into space", SWELL, 4, 3.0,
                      "A spaceship climbing out of a planet's atmosphere into space, a roaring rush of wind thinning away to near silence"),
    "entry": Sound(SPACE, "plunging into a world's air", SWELL, 4, 3.0, "A spaceship plunging into a planet's atmosphere, a rising roar of burning air and buffeting fire"),
    "charge": Sound(SPACE, "a gate charging round the ship", SWELL, 4, 3.2, "A jump gate charging up around a spaceship, a deep electric hum rising to a high crackling whine"),
    "jump": Sound(SPACE, "out of a gate in another system", TAIL, 3, 2.2, "A spaceship jumping through a gate, a sharp electric crack and a deep whooshing boom fading out"),
    "air": Sound(SPACE, "the air roaring round the ship on the way down or up", LOOP, 8, 4,
                 "A spaceship plunging through a planet's upper atmosphere, a steady rushing roar of burning air with heavy buffeting and crackling fire, constant, unchanging", takes=4),
    "blackhole": Sound(SPACE, "near a black hole", LOOP, 10, 6,
                       "A black hole in deep space, a vast ominous sub-bass rumble with a slow eerie warbling drone, constant, unchanging", takes=3),
    "kill": Sound(SPACE, "an enemy shot down", SHOT, 1, 0.6, "A short bright electronic confirmation chime, two quick notes"),
    "ambush": Sound(ALARMS, "raiders coming", SHOT, 2, 0.9, "A short tense electronic alert from a cockpit, enemies detected, two rising warning tones"),
    "over": Sound(SPACE, "the last ship lost", TAIL, 2, 1.6, "A short low descending electronic tone, a failure sting"),
    # ── places and weather
    "thunder": Sound(PLACES, "lightning", TAIL, 8, 6.0,
                     "A close lightning strike, one sharp tearing crack of thunder followed by a deep heavy rolling rumble that slowly dies away", variants=2),
    "burn": Sound(PLACES, "lava (or acid) burning the hull", TAIL, 2, 1.0,
                  "A metal hull scorched by heat rising from molten lava below, a hot sizzling hiss with crackling and bubbling molten rock", variants=2),
    # ── alarms
    "alarm_hull": Sound(ALARMS, "hull nearly gone", SHOT, 2, 0.7, "A fighter cockpit's urgent two-tone warning alarm, hull damage critical, one short cycle"),
    "missile_warning": Sound(ALARMS, "missile coming, one beep", SHOT, 1, 0.25,
                             "One urgent high-pitched electronic warning beep from a fighter cockpit, incoming missile alarm, a single beep"),
    # ── the interface
    "ui_open": Sound(UI, "a panel opens", SHOT, 1, 0.4, "A sci-fi menu panel sliding open, a short soft electronic swish upward"),
    "ui_close": Sound(UI, "a panel closes", SHOT, 1, 0.4, "A sci-fi menu panel sliding shut, a short soft electronic swish downward"),
    "ui_move": Sound(UI, "the focus moves", SHOT, 1, 0.12, "A tiny soft electronic tick of a menu cursor moving, one tick"),
    "ui_select": Sound(UI, "a button pressed", SHOT, 1, 0.2, "A crisp bright interface click, a sci-fi touchscreen button tapped, a tiny high tick with a soft electronic blip, one click only, no low thump"),
    "ui_confirm": Sound(UI, "confirmed", SHOT, 1, 0.5, "A short pleasant electronic confirm tone, two quick rising notes"),
    "ui_error": Sound(UI, "refused", SHOT, 1, 0.4, "A short soft electronic error tone, a low dull buzz"),
}


# ── music (ElevenLabs Music, music_v2_5): one shared style, and each piece laid out section by section.
#
# James, 2026-11-19, gave a key for ElevenLabs (a paid plan: its music may be used in a game sold) for "a wider,
# better, more varied and fun, intense set of music". It is the one service here that is not on this PC; only
# these words are sent to it. The ACE-Step takes it replaced are in art/audio/takes/music-acestep/ (not in git).
#
# Each piece is a plan of sections (`parts`: a name with directions in braces, seconds, and that section's own
# styles), the first section led by SCORE (the sound the whole game shares) and the piece's own `styles`. The
# fight is three pieces at one tempo and key (alert, combat, peril), so the game can go from one to another as a
# fight heats up or cools. Stings are a few seconds long and played over whatever is playing.
SCORE = [
    "instrumental",
    "original video game soundtrack",
    "1990s sequenced MIDI game music",
    "General MIDI sound module instruments",
    "quantized MIDI sequencing, every note on the grid",
    "retro science fiction",
    "a catchy, memorable melody",
    "dry, clear mix",
]
NO_VOICES = ["vocals", "singing", "choir voices", "spoken word", "rap"]
# (James, 2026-11-19, of the first ElevenLabs set: "it needs to be more in keeping with the game, more midi". The game
# is pixel art; its music is now sequenced as a game of the early 1990s would have it, on the patches of a MIDI sound
# module, never a live orchestra, a film score or a modern production.)
NOT_MIDI = ["live orchestra recording", "cinematic trailer music", "epic film score", "realistic acoustic instruments",
            "modern pop production", "heavy reverb", "dubstep", "lo-fi"]

# what the fight shares, so that its three levels cross into each other
FIGHT = ["140 BPM", "E minor"]


class Part:
    def __init__(self, name, seconds, styles, negative=None):
        self.name = name  # its name, and directions in braces: "[Build] {drums enter}"
        self.seconds = seconds
        self.styles = styles
        self.negative = negative or []


class Piece:
    def __init__(self, label, styles, parts, takes=2, variants=None, use=None, sting=False, loud=-24.0, bright=0.12, negative=None, new=True, steady=False):
        self.label = label
        self.styles = styles  # the piece's own, after SCORE
        self.parts = parts
        self.takes = takes
        self.variants = variants or takes  # how many takes the game takes turns with
        self.use = use  # the takes chosen by ear (None: by measurement)
        self.sting = sting  # a few seconds, played once over the music
        self.loud = loud  # dBFS over its louder half: the fight and the stings sit higher
        self.bright = bright  # the share of it above 4 kHz allowed before it is flagged bright (a MIDI square lead is bright)
        self.negative = negative or []
        self.new = new
        self.steady = steady  # it must not stop: breaks the service leaves between sections are cut out (music.py close_gaps)

    @property
    def seconds(self):
        return sum(p.seconds for p in self.parts)

    def plan(self):
        """The composition plan for music_v2_5."""
        chunks = []
        for i, p in enumerate(self.parts):
            styles = (SCORE + self.styles + p.styles) if i == 0 else p.styles + self.styles[:2] + ["sequenced MIDI"]
            chunks.append({
                "text": p.name,
                "duration_ms": int(p.seconds * 1000),
                "positive_styles": styles,
                "negative_styles": NO_VOICES + NOT_MIDI + self.negative + p.negative,
                "context_adherence": "high",
            })
        return {"chunks": chunks}


MUSIC = {
    # the opening story (IntroCrawl.svelte, about a minute and a half, read over): a slow tale told, the narrator's voice
    # kept clear (nothing in the middle of the range while he speaks: low bass, high bells, soft pads); a little louder
    # than the others, as it is held down under him nearly all the while (narration.ts UNDER)
    "intro": Piece("the opening story", ["a slow storytelling theme for the opening of a space war game", "warm synth pad patch and a soft square-wave lead", "D minor", "76 BPM", "a tale of war and exile told by an old soldier"], [
        Part("[Dark] {a low held synth bass note and a glassy bell patch, stars between two suns}", 15, ["sparse", "mysterious", "patient"]),
        Part("[The war] {a slow marching pulse on a low tom patch, a lonely square lead plays the theme softly}", 35, ["solemn", "melodic", "steady", "understated"]),
        Part("[The worlds] {a slow arpeggio on an FM electric piano patch, the synth strings patch holds chords under it}", 35, ["hopeful and sad", "flowing", "gentle"]),
        Part("[The dock] {the theme again on a brass section patch, the pulse and the arpeggio together, quietly building}", 30, ["resolute", "rising", "noble"]),
        Part("[Coda] {the pad and the bell patch alone, one last note of the theme}", 15, ["quiet", "open ending"]),
    ], takes=2, variants=2, loud=-23.0, steady=True),
    "title": Piece("the title", ["a heroic main menu theme for a space war game", "a soaring square-wave lead over a synth brass patch", "D minor", "96 BPM"], [
        Part("[Intro] {a synth strings patch swells, an orchestra hit, a drum machine fill}", 12, ["anticipation", "bold"]),
        Part("[Theme] {a bold, catchy lead melody on a square-wave patch, a pumping FM bass, a crisp MIDI drum kit}", 45, ["heroic", "memorable", "driving"]),
        Part("[Bridge] {the lead hands over to a synth brass patch, the strings patch climbs}", 30, ["epic", "rising", "noble"]),
        Part("[Theme again] {the theme returns doubled in octaves, timpani patch rolls, orchestra hits}", 35, ["triumphant", "powerful"]),
        Part("[Outro] {the theme slows on the strings patch, a held chord}", 13, ["resolved", "fading"]),
    ], takes=2, variants=2),
    "calm": Piece("a calm world", ["cheerful exploration music for flying over a planet", "a bright square-wave lead and a plucked synth arpeggio", "G major", "104 BPM", "the joy of flying"], [
        Part("[Morning] {a plucked synth arpeggio, a soft pad patch, a light MIDI hi-hat}", 25, ["gentle", "airy", "curious"]),
        Part("[Flight] {a bouncy MIDI drum kit and a round synth bass, a singing lead melody}", 50, ["uplifting", "melodic", "catchy", "steady groove"]),
        Part("[High] {the synth strings patch doubles the melody, the arpeggio climbs, a bell patch sparkles}", 40, ["soaring", "optimistic"]),
        Part("[Glide] {the drums drop out, arpeggio and pad}", 25, ["calm", "resolving"]),
    ], takes=2),
    "night": Piece("a world at night", ["slow nocturnal game music", "a vibraphone patch and a warm pad patch", "a soft MIDI drum kit with brushes", "A minor", "80 BPM"], [
        Part("[Dusk] {a slow synth bass pulse, a warm pad, a distant bell patch}", 30, ["quiet", "starlit", "spacious"]),
        Part("[Moonlight] {a soft brushed beat, a lonely melody on the vibraphone patch, a fretless bass patch}", 55, ["melancholy", "beautiful", "hypnotic"]),
        Part("[Small hours] {the beat thins away, only the pulse and the bells}", 35, ["still", "tender"]),
    ], takes=2),
    "harsh": Piece("a harsh world", ["dark menacing game music for a hostile planet", "a distorted FM bass riff and metallic MIDI percussion", "a low synth brass patch", "C minor", "92 BPM"], [
        Part("[Wasteland] {a low droning synth patch, metallic percussion patches far off}", 25, ["ominous", "desolate"]),
        Part("[March] {a heavy MIDI drum kit beat, a grinding FM bass riff, low synth brass stabs}", 55, ["relentless", "threatening", "driving"]),
        Part("[Storm] {faster percussion, dissonant synth strings patch, a sawtooth lead wails}", 40, ["tense", "hostile", "powerful"]),
        Part("[Ashes] {the beat stops, the drone and a few metallic hits remain}", 20, ["bleak", "dark"]),
    ], takes=2),
    "foot": Piece("on foot", ["playful alien exploration music", "a marimba patch and a kalimba patch", "MIDI hand percussion and a bouncy slap bass patch", "F major", "112 BPM"], [
        Part("[Landing] {curious marimba patch notes, a soft pad, little bird-like synth chirps}", 25, ["curious", "light", "wonder"]),
        Part("[Trek] {a bouncy groove of conga and bongo patches and slap bass, a cheerful marimba melody}", 55, ["fun", "adventurous", "rhythmic", "upbeat"]),
        Part("[Discovery] {a synth horn patch takes the melody, the groove opens up}", 35, ["bright", "wondrous"]),
        Part("[Rest] {back to the plucks and the soft pad}", 20, ["gentle", "content"]),
    ], takes=2),
    "space": Piece("space", ["vast deep-space game music", "a slow arpeggiated synth sequence", "a warm pad patch and a deep pulsing synth bass", "B minor", "84 BPM"], [
        Part("[Void] {a cold shimmering pad patch, a slow sequence in the distance}", 30, ["vast", "weightless", "awe"]),
        Part("[Orbit] {the sequence grows, a soft MIDI drum pulse, a long melody on a square-wave lead}", 55, ["hypnotic", "wonder", "steady motion"]),
        Part("[Horizon] {the synth strings patch swells under the sequence, the melody rises}", 40, ["majestic", "expansive"]),
        Part("[Drift] {the sequence fades into the pad}", 25, ["calm", "infinite"]),
    ], takes=2),
    "cruise": Piece("the cruise drive", ["fast driving game music for racing between planets", "a pumping octave synth bass and racing arpeggios", "a four-on-the-floor MIDI drum kit", "A minor", "128 BPM", "speed and freedom"], [
        Part("[Spool] {the arpeggio speeds up, a snare roll, the kick enters}", 15, ["building", "anticipation"]),
        Part("[Burn] {the full driving beat, octave bass, a bright sawtooth lead melody}", 55, ["fast", "energetic", "euphoric"]),
        Part("[Overdrive] {a key change up, the lead doubled by a synth brass patch, orchestra hits}", 40, ["exhilarating", "triumphant"]),
        Part("[Coast] {the beat keeps on, the lead drops out, the arpeggios carry it}", 25, ["driving", "smooth"]),
    ], takes=2, steady=True),
    "hole": Piece("near a black hole", ["eerie unsettling game music", "low synth drones bending in pitch", "a slow ticking clock-like percussion patch", "D minor", "60 BPM"], [
        Part("[Pull] {a low synth bass swelling, a ticking woodblock patch}", 35, ["dread", "immense", "eerie"]),
        Part("[Event horizon] {the synth strings patch bends downward in pitch, a deep pounding timpani heartbeat}", 45, ["terrifying", "intense"]),
        Part("[Beyond] {everything slows, a single high held tone on a glass patch}", 25, ["alien", "still"]),
    ], takes=2, variants=1),
    "hangar": Piece("the hangar and the station", ["laid-back funky game music for a space station shop", "an FM electric piano patch and a slap bass patch", "a relaxed MIDI drum kit beat", "F major", "96 BPM", "a busy friendly workshop"], [
        Part("[Shift start] {electric piano chords, a drum machine, a light synth hum}", 25, ["relaxed", "warm", "groovy"]),
        Part("[Workshop] {a funky slap bass line, clavinet patch stabs, a smooth synth lead}", 55, ["cool", "playful", "head-nodding"]),
        Part("[Tune-up] {a short square-wave lead solo over the groove}", 35, ["fun", "confident"]),
        Part("[Wind down] {the bass and keys settle}", 20, ["chill", "easy"]),
    ], takes=2),
    "map": Piece("the map", ["tactical strategy game music", "a ticking sequencer pulse", "a synth strings patch ostinato and a soft synth brass patch", "G minor", "92 BPM", "planning a war across the stars"], [
        Part("[Briefing] {a ticking pulse, a low strings patch ostinato, soft pads}", 35, ["focused", "thoughtful", "tense"]),
        Part("[Strategy] {a muted MIDI snare pattern, a synth brass theme, the ostinato grows}", 45, ["determined", "strategic", "building"]),
        Part("[Resolve] {the pulse and the strings alone}", 25, ["calm", "ready"]),
    ], takes=2, variants=1, steady=True),
    "alert": Piece("a fight coming (enemies near)", FIGHT + ["tense action game music", "a pulsing octave synth bass ostinato", "ticking MIDI hi-hats and a heartbeat kick"], [
        Part("[Contact] {a pulsing bass ostinato, ticking percussion, a low warning synth}", 35, ["suspense", "danger approaching", "restrained"]),
        Part("[Closing in] {staccato synth strings patch joins, tom patches build}", 40, ["tension rising", "urgent", "ominous"]),
        Part("[Hold] {the pulse and the strings, synth brass swells}", 30, ["anxious", "steady", "dark"]),
    ], loud=-23.0, steady=True),
    "combat": Piece("a fight", FIGHT + ["intense space dogfight game music", "a fast MIDI drum kit with double kicks", "an aggressive distorted FM bass", "synth brass stabs and orchestra hits", "a screaming sawtooth lead"], [
        Part("[Engage] {the full beat hits at once, distorted bass, orchestra hits}", 35, ["aggressive", "powerful", "energetic", "heroic"]),
        Part("[Dogfight] {fast staccato strings patch, a screaming sawtooth lead melody, relentless drums}", 45, ["intense", "relentless", "adrenaline"]),
        Part("[Breakdown] {half time, a huge low synth brass theme over the drums}", 20, ["massive", "dramatic"]),
        Part("[Strike] {everything back at full speed, the lead and the brass together}", 35, ["intense", "triumphant", "driving"]),
    ], takes=2, loud=-22.0, steady=True),
    "peril": Piece("a fight going badly", FIGHT + ["desperate frantic action game music", "double-time MIDI drums", "alarm-like square-wave stabs", "dissonant racing synth strings"], [
        Part("[Mayday] {an alarm-like square-wave stab, double-time drums crash in}", 30, ["frantic", "desperate", "chaotic"]),
        Part("[Evade] {racing dissonant strings patch, pounding toms, distorted bass}", 45, ["maximum intensity", "panic", "relentless"]),
        Part("[Last stand] {a defiant synth brass theme over it all}", 30, ["heroic", "desperate"]),
    ], loud=-22.0, steady=True),
    # stings: played once over the music
    "win": Piece("a fight won", ["a short triumphant victory jingle", "synth brass patch and a bright square-wave lead", "a timpani patch", "E major"], [
        Part("[Fanfare] {a rising brass and lead fanfare ending on a big held major chord}", 6, ["triumphant", "short", "resolved ending"]),
    ], takes=2, variants=2, sting=True, loud=-20.0, bright=0.15),
    "lost": Piece("shot down", ["a short dark falling jingle", "a synth strings patch and a descending square-wave lead", "a low orchestra hit"], [
        Part("[Fall] {a low orchestra hit, then a slow descending lead and strings, dying away}", 6, ["tragic", "dark", "short", "fading ending"]),
    ], takes=2, variants=1, sting=True, loud=-21.0),
    "arrive": Piece("a new system reached", ["a short shimmering arrival jingle", "a rising synth arpeggio", "a wide warm pad chord"], [
        Part("[Arrival] {a fast rising arpeggio on a bell patch opening into a wide glowing chord}", 7, ["wonder", "short", "open ending"]),
    ], takes=2, variants=2, sting=True, loud=-21.0, bright=0.15),
    "taken": Piece("a world taken", ["a short proud martial jingle", "a MIDI snare roll and synth brass", "a timpani patch and an orchestra hit"], [
        Part("[Victory] {a snare roll and a proud brass theme ending on a huge chord}", 8, ["triumphant", "proud", "short", "resolved ending"]),
    ], takes=2, variants=1, sting=True, loud=-20.0, bright=0.15),
}
