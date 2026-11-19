"""Draws mockups of what parts of the game should look like, to build towards.

  python3 tools/gen/mockups.py              # every mockup, into art/mockups
  python3 tools/gen/mockups.py hud space    # only these
  python3 tools/gen/mockups.py hud --seed 3 # another try

These are targets for the look, not assets: nothing here goes into the game as it is.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "mockups")

STYLE = "crisp chunky pixel art, 16-bit era game screenshot, limited colour palette, no anti-aliasing, no blur, no text"
SHIP = "a small pointed angular dark gunmetal spaceship with orange markings and a teal canopy"

MOCKUPS = {
    "hud": f"top-down view from directly above of {SHIP} flying over a tropical island coast with white clouds, chasing two enemy spaceships, yellow tracer fire and a small explosion, a minimal heads-up display in the corners: thin hull and shield bars bottom left, a small round radar top right, a small heat gauge bottom right",
    "dogfight": f"top-down view from high above of a dogfight over a tropical island coast: six tiny {SHIP}s and enemy ships with red markings, small against the sea, short bright yellow tracer bolts, one enemy bursting in an orange fireball with black smoke and falling sparks, a damaged ship trailing grey smoke, white wingtip trails curving, a minimal pixel heads-up display: thin hull and shield bars bottom left, a small round radar top right, small red target brackets around one enemy",
    "explosion": "a sprite sheet of pixel art effects for a top-down space shooter on a dark blue background: a row of explosion frames from white flash to orange fireball to dark smoke puff, a row of yellow tracer bolts and muzzle flashes, a row of small hit sparks, a small homing missile with a white smoke trail",
    "space": f"top-down view of {SHIP} flying through space past a huge banded gas giant planet and a small cratered moon, an angular space station with docking arms and lights in the distance, dark starfield, a faint nebula",
    "onfoot": f"top-down view from directly above of a tiny pilot in a spacesuit walking on a sandy beach beside a landed spaceship, {SHIP}, a small flag planted in the sand, palm trees, an ore outcrop of glowing crystals, gentle surf",
    "hangar": "top-down view from directly above of the inside of a small spaceship hangar, a parked pointed angular spaceship in the middle, metal floor tiles, a workbench, tool racks, cargo crates, a paint booth, a tiny pilot walking, warm work lights",
    "galaxy": "a star map screen for a space game: a dozen star systems joined by thin jump lanes, half tinted gold and half tinted violet, a bright core in the middle, a few glowing hotspot markers, dark background, thin elegant interface frame",
    "title": f"the title screen of a pixel art space game on a wide landscape phone screen: a dark night sky full of stars over a tropical island coast seen from high above, {SHIP} small in the middle climbing away, a big chunky blocky pixel logo panel across the top third, a single small rectangular button with hard square corners and a thin light border below it, lots of empty dark space, minimal and clean",
    "faction": "a choose-your-side screen of a pixel art space game on a wide landscape phone screen: two tall rectangular cards side by side with hard square corners and thin borders on a dark starry background, the left card dark navy with a large gold triangle emblem and thin gold rules, the right card dark rust brown with a large violet diamond emblem and rivets and hazard stripes, a short line of small blocky lettering under each emblem, a small rectangular button under each card, minimal and clean",
    "settings-4": "the settings screen of a pixel art space game on a wide laptop screen, over a dark starry sky: one wide dark night-blue panel with hard square corners, a thin double gold rule along its top, a narrow column of five large chunky pixel icons down its left side (a game controller, a loudspeaker, a framed picture, a brass key, a radio mast) the first lit with a gold bar beside it, and on the right a tidy keyboard cluster of four cream square key caps arranged as on a keyboard, one above and three below, beside two neat columns of rows each with a small pixel icon on the left and one or two cream key caps at its right end, short group headings in small dim capitals, generous dark space, minimal and clean",
    "gallery": "a web page gallery for a pixel art space game on a dark night-blue background: a tidy grid of twelve cards with hard square corners and thin cream borders, each card a small screenshot of a different planet surface seen from straight above (green islands, red canyons, white ice floes, black rock with glowing lava, dense jungle, tan mesas, deep blue ocean with atolls, a grey cratered moon), under each picture a short line of small blocky cream lettering and two dimmer lines, a row of small rectangular filter buttons along the top, minimal and clean",
    "portraits": "a row of six alien and human pilot portraits for a space game, head and shoulders, each in a small square frame: a human in a helmet with a gold visor, a small bird person with a feather crest, a brass clockwork robot with one round glowing lens, a broad shell-backed armoured alien with four small eyes, a moth person with feathery antennae and huge dark eyes, a mushroom-capped alien with lantern eyes",
}

# The planets' archetypes (the plan's section 5), each seen from above as the game draws a
# world: ground in stacked terraces like a contour model, clouds casting shadows. One shared
# view, then each archetype's ground. The terrain code takes its palette and features from these.
WORLD = "a wide aerial view looking straight down from very high above at a large stretch of an alien planet's surface, like the overworld map of a 16-bit pixel art game, many features spread across the whole picture, hills drawn as low stepped terraces, a few small clouds casting soft shadows"
WORLDS = {
    "world-archipelago": "green islands with terraced grassy hills, grey rock peaks, dark green forest clumps, sandy beaches, white surf and a glittering blue sea",
    "world-continental": "a big continent with long jagged mountain ranges of grey rock with snow caps, wide green valleys and plains, winding rivers running to the coast, dark green forests, a sandy shore and blue sea at one edge",
    "world-canyon": "a red and orange desert cut by deep narrow winding canyons with layered sandstone walls in bands of red, orange and cream, dark shadowed canyon floors with a thin river, dry plateaus with scattered boulders",
    "world-ice": "a frozen world of white glaciers and pale blue ice sheets, deep fjords of dark blue water between snowy cliffs, cracked floating sea ice, grey rock ridges poking out of the snow, high thin clouds",
    "world-volcanic": "a volcanic world of black basalt rock and dark grey ash plains, glowing orange lava rivers and lava lakes with bright yellow edges, volcano cones with glowing craters, drifting dark ash clouds, dim red light",
    "world-jungle": "a dense jungle world, a thick carpet of round dark green and lime tree canopies, murky green swamps and brown winding rivers, tall rocky mesas covered in vines rising out of the forest, white mist",
    "world-mesa": "a world of flat tablelands with sheer cliffs, wide flat-topped mesas in tan and ochre with darker stepped cliff faces in strata bands, dusty orange plains far below with dry riverbeds and sparse scrub, long cliff shadows",
    "world-ocean": "an ocean world, almost all deep blue and turquoise sea, a few tiny ring-shaped coral atolls with white sand, shallow turquoise lagoons, a few palm trees, white surf",
    "world-moon": "a barren grey airless moon, many round impact craters of every size with raised rims and dark shadows inside, rocky ridges, dusty plains, no water and no clouds, harsh black shadows",
}
MOCKUPS.update({name: f"{WORLD}, {ground}" for name, ground in WORLDS.items()})

# Phase 4, grab and bank: the bases, the ore, mining, loot, and the screens of the loop. The
# world's stamped features take their look from these (world/features.ts).
ABOVE = "top-down view looking straight down from directly above, like a 16-bit pixel art game's overworld, ground drawn as low stepped terraces"
MOCKUPS.update({
    "base": f"{ABOVE}, a small frontier landing base on grassy island ground: one square concrete landing pad with yellow and black hazard stripes along its edges and small lights at its corners, three low angular buildings with flat grey metal roofs, roof vents and dark seams, a hangar with a long sloped roof, a tall thin flag mast with a gold pennant, two small squat gun turrets on round plinths, a packed dirt apron with tyre tracks fading into the grass, short hard shadows",
    "base-desert": f"{ABOVE}, a small outpost landing base on red desert sand: one square concrete landing pad with yellow and black hazard stripes and corner lights, low angular buildings with flat rust-streaked metal roofs, fuel tanks, a tall thin radio mast, two small squat gun turrets on round plinths, packed dusty ground and tyre tracks fading into the sand, short hard shadows",
    "base-capital": f"{ABOVE}, a fortified faction capital base: two square concrete landing pads with hazard stripes and corner lights side by side, a row of angular command buildings with flat dark metal roofs trimmed in gold, a tall flag mast with a gold triangle banner, four heavy gun turrets at the corners on round plinths, a concrete apron with painted lines, short hard shadows",
    "ore": f"{ABOVE}, six separate small ore outcrops scattered on dusty ground, each a tight cluster of sharp angular crystals poking out of broken rock: rust red iron ore with dark metallic flecks, pale white and blue quartz, bright cyan ice crystals, deep red glowing volcanic glass, translucent amber resin, and a twisted dark metal wreck of a crashed ship, each casting a short hard shadow",
    "ore-rich": f"{ABOVE}, one large rich ore deposit: a wide crater of broken grey rock packed with big sharp glowing crystal spires in bright cyan and white, smaller crystal clusters scattered around it, a few dropped glowing ore chunks on the ground, short hard shadows",
    "mining": f"{ABOVE}, {SHIP} hovering low over an outcrop of glowing cyan ore crystals on brown rocky ground, a thick bright mining laser beam from a mount under the ship's nose down to the crystals, a white hot core with a wide dithered cyan glow round it, a blinding white impact point with a ring of heat glowing orange on the rock, bright sparks and grey rock flecks and dust spraying out of the impact, small glowing ore chunks flying out, four thin white corner brackets framing the outcrop, a short slim horizontal progress bar under the brackets half filled in cyan, a small square ore icon beside the brackets",
    "mining-behind": f"third person view from behind and above a pointed angular dark gunmetal spaceship with orange markings hovering low over a rocky alien desert, a thick bright mining laser beam from under its nose angling down to a glowing cluster of amber ore crystals ahead, a white hot core with a dithered amber glow, a blinding white impact with sparks and rock flecks and dust spraying out, the rock round the impact glowing red hot, four thin white corner brackets framing the crystals with a small square ore icon, a slim horizontal progress bar half filled in amber at the bottom middle of the screen",
    "landing": f"{ABOVE}, {SHIP} hovering just above a square concrete landing pad with yellow and black hazard stripes, about to touch down, rings of pale dust blowing out across the pad and the ground around it, its shadow right under it, low buildings and a gun turret beside the pad",
    "crate": f"{ABOVE}, a single sturdy cargo crate lying on scorched ground beside the smoking twisted wreck of a crashed spaceship, the crate dark grey metal with yellow and black hazard stripes and a small blinking green light, scattered glowing ore chunks around it",
    "loot-icons": "a sprite sheet of eight item icons for a pixel art space game, each centred in its own dark square tile with a thin border, in a row: a chunk of rust red iron ore, a pale quartz crystal, a bright cyan ice crystal, a glowing red shard of volcanic glass, an amber blob of resin, a piece of twisted salvaged metal, a gold credit chip coin, a small cargo crate with hazard stripes",
    "inventory": "the inventory screen of a pixel art space game on a wide landscape phone screen: two panels side by side with hard square corners and thin cream borders on a dark navy background, the left panel the ship's cargo hold with a short grid of four large square slots, the right panel the vault with a bigger grid of square slots, each filled slot showing a small chunky ore icon with a number in its corner, a short row of chunky rectangular buttons below, small blocky pixel lettering, minimal and clean",
    "shop": "the shop screen of a pixel art space game on a wide landscape phone screen: a panel with hard square corners and thin cream borders on a dark navy background, a list of ores each with a small chunky icon, a price and a tiny green or red arrow for today's change, beside it a column of things to buy with small icons and prices (a wrench for repairs, a missile, a cargo pod, a paint can), a credits counter with a gold coin in the top corner, chunky rectangular buttons, small blocky pixel lettering, minimal and clean",
    "hud-loaded": f"{ABOVE}, {SHIP} flying fast over green islands with two enemy ships with red markings close behind it firing yellow tracers, a minimal heads-up display: thin hull and shield bars bottom left, a small round radar top right, and beside the hull bars a small cargo gauge of four little square slots filled with glowing ore, a small arrow at the edge of the screen pointing home with a short distance number",
})

# Phase 5, on foot: the pilot creator, and the HUD of a pilot on foot being hunted
MOCKUPS.update({
    "creator": "the pilot creator screen of a pixel art space game on a wide landscape phone screen, dark navy background with thin cream borders and hard square corners: on the left a large square pixel art portrait of an alien pilot, head and shoulders, in a flight suit with a coloured collar, under it a tiny full-body pixel sprite of the same pilot standing; on the right three small race choice tabs with tiny portraits, rows of left and right arrow buttons beside short labels for face, skin, eyes, a row of small colour swatches for the suit and another for its trim, a rectangular Randomise button and a Done button at the bottom, small blocky pixel lettering, minimal and clean",
    "onfoot-hud": f"{ABOVE}, a tiny pilot in a spacesuit running across rough green ground towards a dark forest, two enemy spaceships with red markings swooping low over him firing red tracer shots that kick up puffs of dirt around him, his landed spaceship {SHIP} parked behind him with its canopy open, a minimal pixel heads-up display: a short row of green health pips bottom left with four small empty item slots above it, a small round radar top right, three tiny flare pips bottom right, small blocky words in the middle of the bottom edge",
})

# Phase 6, space: each kind of body as the game should show it from above, in one shared view,
# and the maps. The bodies' art (tools/gen/space.py) is drawn to build towards these.
SPACE = "top-down view from directly above looking down on deep space like a 16-bit pixel art space game, a dark star field with faint distant stars and a faint dusty nebula"
MOCKUPS.update({
    "space-sun": f"{SPACE}, the edge of a huge glowing sun filling the left third of the picture, its yellow-white surface boiling with granules and a few dark sunspots, a ragged bright corona of flares and a wide soft orange glow spreading out into space, {SHIP} small and flying past it",
    "space-world": f"{SPACE}, a large round habitable planet seen from above, green islands and continents in a blue ocean with white swirling clouds, lit from the left with a dark night side on the right, a thin pale blue atmosphere glowing along its rim, {SHIP} small flying over it",
    "space-moon": f"{SPACE}, a small barren grey moon covered in round craters with hard black shadows, lit from one side, a larger blue planet partly in view at the edge, {SHIP} small flying past",
    "space-giant": f"{SPACE}, a huge banded gas giant planet filling half the picture, bands of cream, ochre, rust and brown with swirling storms and a great oval storm, lit from the left with a dark limb, two small grey moons, {SHIP} small skimming along its edge",
    "space-belt": f"{SPACE}, a dense asteroid belt, many drifting grey and brown rocky asteroids of every size from tiny to huge, angular and cratered, a few cracked open with glowing blue ore crystals, {SHIP} weaving between them",
    "space-blackhole": f"{SPACE}, a black hole: a perfectly black round disc surrounded by a thin blazing white ring of light and a wide swirling orange and white accretion disc, the stars and nebula behind it bent into arcs around it, a few glowing purple crystal shards drifting near it, {SHIP} small",
    "space-station": f"{SPACE}, a large angular space station seen straight down from above, built from modules: a central armoured hub, four long docking arms with blinking lights ending in docking bays, wide dark blue solar panel wings, radiator fins, gold trim on dark grey hull plates, {SHIP} small docking at one arm",
    "space-gate": f"{SPACE}, a huge jump gate seen from above: a thick angular ring built from dark metal segments with bright lights at its joints, a swirling blue and white energy field filling the inside of the ring, {SHIP} small flying into it",
    "space-derelict": f"{SPACE}, a broken derelict space station hulk torn into pieces, dark scorched grey metal plates and exposed girders, sparks and small fires, floating debris and scrap, three small red hostile drones circling it",
    "map-system": "the system map screen of a pixel art space game on a wide landscape phone screen, dark navy background with thin cream borders and hard square corners: a glowing sun in the middle, thin circular orbit lines around it, small round planets on the orbits each with a tiny blocky name label, a banded gas giant, a dotted ring of an asteroid belt, small square station icons, small ring-shaped gate icons at the edge, a small arrow for the player's ship and a dashed course line to a planet, small blocky pixel lettering, minimal and clean",
    "map-galaxy": "the galaxy map screen of a pixel art space game on a wide landscape phone screen, dark navy background with a faint violet nebula, thin cream borders and hard square corners: a dozen glowing star systems as small coloured suns joined by thin straight jump lines, gold triangle marks on the systems on the left and violet diamond marks on the systems on the right, a pulsing marker on one system for you are here, a dashed line between two far systems for a black hole shortcut, a small side panel with a planet's name and short lines of details, small blocky pixel lettering, minimal and clean",
})

# Phase 7, factions and the persistent world: territory on the maps, the faction board, talking,
# who is near, and the marks players leave on a world (flags, wrecks, beacons, graves, ghosts)
MOCKUPS.update({
    "map-danger": "the galaxy map screen of a pixel art space game on a wide landscape phone screen, dark navy background, thin cream borders and hard square corners: a dozen small glowing star systems joined by thin jump lines, beside each system a short row of one to three small chunky warning chevrons coloured by danger (green for safe on the left, yellow, orange, red in the middle), a red crossed-swords marker on two systems in the middle where gold and violet patrol marks meet, tiny red skull marks by some jump gates, small gold triangle and violet diamond patrol pips, a small legend box in a corner with four coloured chevron rows, a side panel with a system's name and a coloured danger line, small blocky pixel lettering, minimal and clean",
    "map-territory": "the galaxy map screen of a pixel art space game on a wide landscape phone screen, dark navy background, thin cream borders and hard square corners: a dozen star systems joined by thin jump lines, each system ringed by small planet dots, the planets on the left filled gold with tiny triangle marks and the planets on the right filled violet with tiny diamond marks, a few contested planets half gold half violet in the middle, two systems with a pulsing orange hotspot star marker, small groups of tiny pilot pips beside some systems with a number, a red skull bounty tag with a price beside one system, a side panel with a planet's name, two short horizontal influence bars one gold one violet, small blocky pixel lettering, minimal and clean",
    "faction-board": "the faction board screen of a pixel art space game on a wide landscape phone screen, dark navy background with thin gold rules and hard square corners: at the top a large gold triangle emblem and a title, a wide horizontal bar split gold against violet showing worlds held, a small list of three daily tasks each with a checkbox, a tiny icon, a progress count and a credit reward, a ranked list of five top pilots with small rank badges and numbers, a rank badge with a title for the player, small blocky pixel lettering, minimal and clean",
    "chat": f"a game screenshot seen from just behind and above {SHIP} flying through deep black space past a bright banded gas giant planet on the right, on the left edge of the screen chat messages float directly over the picture with no panel, no window, no frame and no border: eight short rows of small blocky white pixel lettering with a black outline, bottom left, stacked upwards, each row starting with a tiny gold triangle or violet diamond and a short coloured name, the top rows faded and see-through, a faint black shadow behind the left edge only, under them one thin underline for typing and three tiny tab words, a minimal pixel heads-up display: a small portrait and thin bars top left, a small round radar top right, minimal and clean",
    "pilots-nearby": "the pilots nearby screen of a pixel art space game on a wide landscape phone screen, dark navy background with thin cream borders and hard square corners: a list of six rows, each with a tiny square pilot portrait, a gold triangle or violet diamond faction mark, a blocky callsign, a small rank badge, a bounty price on one row in red, and two small square buttons at the right end of each row for mute and block, small blocky pixel lettering, minimal and clean",
    "flag-planted": f"{ABOVE}, a tiny pilot in a spacesuit standing on a packed dirt clearing beside a small frontier base on green grassy ground, having just planted a tall thin flag pole with a gold triangle banner flapping in the wind, a ring of three smaller older flags around a tall mast, some gold and one violet with a diamond, his landed spaceship {SHIP} parked behind him, short hard shadows",
    "traces": f"{ABOVE}, marks other players left on a quiet grassy world: the scorched broken wreck of a crashed spaceship with smoke and scattered scrap, a small stone grave marker with a little helmet on it, a short signal beacon post with a blinking light and a tiny glowing message plate, a faint translucent ghostly blue spaceship flying past, a small planted flag with a violet diamond banner, short hard shadows",
})

# Phase 8, ships, upgrades and the places inside: the station deck, a ship's rooms (a light
# fighter's and a hauler's), a ship fitted with gun pods and modules, the loadout bench and the paint booth
ROOM = "top-down view from directly above of the inside of a room in a 16-bit pixel art game like a classic top-down RPG interior, the back wall showing its face with panels and lights, metal floor plates, short hard shadows"
MOCKUPS.update({
    "deck": f"{ROOM}, a busy space station deck: a long shop counter with a glowing screen and shelves of parts behind it, a big faction notice board on the back wall with pinned papers and a gold triangle emblem, a few benches, potted plants, round pillars, a wide door to the hangars, five tiny pilots in spacesuits walking about, warm lights",
    "cabin-small": f"{ROOM}, the cramped inside of a tiny one-seat fighter spaceship, a narrow pointed room shaped like the ship's nose with angled walls, a pilot's seat facing a curved console of screens at the pointed front, one fold-down bunk along the side wall, a small locker, a hatch at the back, a tiny pilot standing in it, cosy, dim blue lights",
    "cabin-large": f"{ROOM}, the inside of a big cargo hauler spaceship cut away from above, the outline of the ship around the rooms with angled hull walls, a cockpit at the pointed front with two seats, a map room with a round glowing star map table, crew quarters with two bunks and lockers, a galley with a small table, a big cargo bay at the back full of crates, narrow corridors and doors between the rooms, two tiny pilots walking, warm lights",
    "loadout": "a sprite sheet of four copies of the same small pointed angular dark gunmetal spaceship with orange markings seen from directly above on a dark background, each fitted differently: the first bare, the second with two long gun pods under its wings and a radar dish on its spine, the third with a fat cargo pod under its belly and a tractor emitter, the fourth with missile racks under its wings and armour plates on its nose and extra fuel tanks, crisp pixel art",
    "paint-booth": f"{ROOM}, a spaceship paint booth: a parked pointed angular spaceship in the middle half painted in bold red and white stripes with shark teeth on its nose, spray nozzles on robotic arms around it, paint cans and colour swatches on a rack along the wall, a tiny pilot standing by a control panel",
})

# Phase 9, the first session: the guided first sortie's prompts over the game, the settings
# screen, and the reminder to back up a pilot's key
MOCKUPS.update({
    "tutorial": f"{ABOVE}, {SHIP} flying low over green islands towards a small glowing ore outcrop, a pulsing pixel arrow and a dashed ring around the outcrop marking where to go, near the top of the screen one small dark rectangular prompt box with hard square corners and a thin gold border holding one short line of chunky blocky lettering and a small key-cap icon, a tiny row of five step pips under it, a small Skip button in its corner, a minimal pixel heads-up display, lots of clear sky, minimal and clean",
    "settings": "the settings screen of a pixel art space game on a wide landscape phone screen, dark navy background with thin cream borders and hard square corners: a row of five small tab buttons along the top (controls, sound, picture, pilot, network), below them a list of rows each with a short blocky label on the left and on the right small rectangular key-cap boxes showing keys, a few small on-off toggle boxes, two short horizontal volume sliders made of square blocks, a highlighted row with a thick cream outline for the keyboard focus, small blocky pixel lettering, minimal and clean",
    "backup": "a small warning dialog of a pixel art space game on a wide landscape phone screen over a dimmed starry sky: one dark navy panel with hard square corners and a thin gold border, a small pixel key icon in the top corner, two short lines of chunky blocky lettering, a long box holding a scrambled line of code-like text, three small rectangular buttons in a row (save a file, copy, later), small blocky pixel lettering, minimal and clean",
})

# The polish pass, item 9: the sampler page, where James listens to every sound and chooses takes
MOCKUPS.update({
    "sounds": "a web page sound library for a pixel art space game on a dark night-blue background, hard square corners and thin cream borders: a row of small rectangular group tab buttons along the top, below it a tidy grid of cards, each card with a short line of small blocky cream lettering, a tiny waveform icon, and a row of four small square numbered play buttons with triangle play symbols, one of them lit gold as the chosen one, a few cards with a thin amber warning mark, a wider card at the bottom with a long horizontal music progress bar, minimal and clean",
})

# The polish pass, items 4 to 6: space black and empty, worlds at their true size, a whole
# atmospheric entry and exit, and the three views in space. The entry's moments are one shot each,
# from behind the ship (the chase view), in the order they come.
BEHIND = "a view from behind and a little above a small pointed angular dark gunmetal spaceship with orange markings, its engines glowing, like a 16-bit pixel art space flight game"
BLACK = "pure black empty space with a few tiny sparse distant stars"
MOCKUPS.update({
    "entry-1": f"{BEHIND}, the ship small in the middle of the picture high above a vast planet, the planet's curved horizon across the lower half of the picture, green continents, blue sea and white swirls of cloud on it, a thin glowing pale blue line of atmosphere along the curved horizon, above it {BLACK}",
    "entry-2": f"{BEHIND}, the ship diving down towards a vast planet that fills almost the whole picture, the curved horizon near the top edge with a thin glowing blue atmosphere, green land and blue sea and white clouds below, the ship's nose starting to glow orange with the heat of entry, a faint orange shimmer around it, black space with a few stars above the horizon",
    "entry-3": f"{BEHIND}, the ship wrapped in bright orange and yellow fire and plasma streaks of atmospheric entry, flames streaming back past it, below it a planet's surface of green land, blue sea and white clouds seen through heat haze, the sky above the curved horizon a deep dark blue fading to black",
    "entry-4": f"{BEHIND}, the ship flying high in the upper atmosphere of a planet, the last wisps of orange glow trailing off its hull, the sky a deep blue getting lighter towards a wide gently curved horizon, far below green islands and blue sea under scattered white clouds",
    "entry-5": f"{BEHIND}, the ship flying high over green islands and blue sea under a bright pale blue sky, white clouds below it, the horizon almost flat and hazy, a few tiny islands far away",
    "exit-1": "top-down view looking straight down from high above at a small pointed angular dark gunmetal spaceship climbing away from a planet like a 16-bit pixel art game, green islands and blue sea and white clouds far below it, the ground beginning to curve away at the edges of the picture into a dark blue haze",
    "exit-2": f"top-down view looking straight down from high above at a small pointed angular dark gunmetal spaceship over a whole round planet below it like a 16-bit pixel art game, the planet a globe with green continents, blue sea and white clouds, lit from the left with a dark night side on the right, a thin glowing pale blue atmosphere around its rim, all around it {BLACK}",
    "space-overhead": f"top-down view from directly above of a small pointed angular dark gunmetal spaceship with orange markings flying in {BLACK}, far below it a huge planet seen from above, only part of it in the picture, lit from one side with a sharp line between its day side and its dark night side, a thin glowing rim of atmosphere, like a 16-bit pixel art space game",
    "space-chase": f"{BEHIND}, the ship flying through {BLACK} towards a huge planet that rises from below the bottom of the picture, its curved lit edge and thin glowing atmosphere, a dark night side, a small bright distant sun high in the black sky",
    "space-cockpit": "first person view from inside a spaceship cockpit, the dark instrument panel and canopy frame around the edges of the picture, through the canopy a huge planet below the horizon with green continents, blue sea and white clouds, its curved edge glowing with a thin pale blue atmosphere, black space with a few tiny stars above, like a 16-bit pixel art flight game",
    "space-black": f"wide view of {BLACK}, a distant yellow sun small and bright with a soft round glow on the left, on the right a large planet lit only on one side as a thick crescent, its night side black against the black of space, like a 16-bit pixel art space game, very dark and empty",
    "space-giant-close": f"{BEHIND}, the ship flying low along the vast curved edge of a banded gas giant planet that fills the lower two thirds of the picture, smooth flowing bands of cream, ochre, rust and brown with long turbulent swirling eddies where the bands meet, a great oval storm, a dark night side on one edge, black space above",
    "space-station-guns": f"top-down view from directly above of a large angular space station in {BLACK}, a central armoured hub, three long docking arms ending in docking bays with blinking lights, wide dark blue solar panel wings, and four small gun turrets on its hull firing short yellow tracer bolts at a distant enemy ship, gold trim on dark grey hull plates, like a 16-bit pixel art space game",
})

# The polish pass, items 1, 3 and 7: the pilot his true size beside his ship, a cockpit for every
# hull (each its own shape, one shared look), and rooms worth walking into, lit and lived in
MOCKUPS.update({
    "pilot-scale": f"{ABOVE}, {SHIP} landed on a square concrete landing pad with yellow and black hazard stripes, its canopy open, a very tiny pilot in a white helmet and a dark flight suit standing beside the ship's nose, the pilot an eighth as long as the ship, a short boarding ladder, a low angular base building with a small door, a cargo crate, short hard shadows",
})
COCKPIT = "first person view from the pilot's seat inside the cockpit of a small science fiction fighter spacecraft, like a 16-bit pixel art space flight game, the canopy frame and its struts framing a wide view out over a green planet's coast far below and blue sky, an instrument panel across the bottom third with small glowing screens, a round radar screen, gauges and switches, sensible colours, crisp clean pixel art, no text"
COCKPITS = {
    "dart": "a light fighter's tight cockpit: a single bubble canopy of curved glass with one thin frame arching overhead, a small low panel with two little screens, gunmetal grey with orange trim",
    "sparrow": "a scout's cockpit: a big teardrop canopy with a thin frame and a wide view all round, a slim panel with a long sensor screen and a small radar, pale grey with orange trim",
    "lance": "an interceptor's narrow cockpit: a long thin pointed canopy with a central spine strut running forward to the nose, a narrow panel with a tall speed tape, dark steel with orange trim",
    "corsair": "a raider's cockpit: an angular canopy with two slanted struts, a sturdy panel with a radar screen on the left and a weapons screen on the right, gunmetal with orange trim",
    "wraith": "a stealth ship's dark angular cockpit: faceted black canopy panes with sharp angled struts like a stealth jet, a low panel glowing faint violet and red, matte black with dark orange trim",
    "prospector": "a mining ship's cockpit: a rounded industrial canopy with thick struts and a grille, a chunky panel with an ore scanner screen and big switches, scuffed yellow-grey metal with orange trim",
    "mule": "a cargo hauler's wide boxy cockpit: a broad flat windscreen of square panes with thick upright struts, a wide panel with cargo hold readout screens of stacked boxes, worn grey with orange trim",
    "bastion": "a heavily armoured gunship's cockpit: thick armour plates over the canopy leaving narrow slit windows, a heavy panel with a big targeting screen and ammunition counters, dark olive steel with orange trim",
    "nomad": "a long range explorer's cockpit: a wide curved panoramic canopy with slim struts, a panel with a star chart screen and navigation instruments, warm grey with orange trim and a few personal trinkets",
    "galleon": "a big freighter's bridge cockpit: a wide wraparound windscreen in many panes with heavy frames, a long broad console with many screens, a captain's seat, steel grey with orange trim",
}
MOCKUPS.update({f"cockpit-{hull}": f"{COCKPIT}, {what}" for hull, what in COCKPITS.items()})
INSIDE = "top-down view from directly above of the inside of a room in a science fiction spaceship, like a beautiful 16-bit pixel art top-down RPG interior, the back wall showing its face with panels, pipes and lights, the walls thick with depth, a lit metal floor with warm pools of light from ceiling lamps and soft shadows, lived in and cosy, rich colours, one tiny pilot standing in it"
ROOMS = {
    "room-cockpit": "a spaceship's cockpit room: a pointed room shaped like the ship's nose with angled walls and wide windows at the front showing stars, two pilot seats facing a curved flight console of glowing screens and switches, a small side console",
    "room-bunk": "a small cabin: a fold-down bunk bed with a rumpled blanket and pillow, a tall metal locker, a little shelf with personal things, a small rug, a reading lamp, a round porthole window",
    "room-maproom": "a map room: a big round star chart table in the middle with a glowing blue hologram of planets above it, wall screens with star maps, two chairs, a globe, charts pinned on the wall",
    "room-quarters": "crew quarters: four bunks along the walls with blankets, lockers, a mess table with chairs, a small galley counter with a kettle, potted plants, a rug, a trophy cabinet",
    "room-cargo": "a cargo bay: stacks of strapped down cargo crates and barrels on pallets, cargo racks along the walls, a small lift loader, yellow and black hazard stripes on the floor, a big loading door",
    "room-engine": "an engine room: a big glowing reactor core in the middle in a ring of pipes, pipes and conduits along the walls, a control console, tool racks, warning stripes, warm orange and teal glow",
    "room-hangar": "a spaceship hangar: a big parked pointed angular dark gunmetal spaceship with orange markings filling the middle of the room, a workbench with tools, a paint booth with spray arms, an armoured vault door, tool racks, cargo crates, yellow hazard lines on the floor, bright work lights",
    "room-deck": "a busy space station deck: a long shop counter with glowing screens, a faction notice board on the back wall, a big window onto space with stars and a planet, benches and potted plants, a bar with stools, a few pilots walking about, warm lights",
}
MOCKUPS.update({room: f"{INSIDE}, {what}" for room, what in ROOMS.items()})

# Creatures on foot: the wildlife a pilot hunts on a world, beside him at the game's scale, and what
# they drop. The creatures' sprites (tools/gen/creatures.py) are drawn to build towards these.
WILD = "top-down view from slightly above of a stretch of alien planet ground like a 16-bit pixel art top-down action role playing game, everything tiny and at one scale, a tiny pilot in a white round helmet and a lime green suit firing a short yellow blaster bolt"
MOCKUPS.update({
    "creatures": f"{WILD}, standing on grassy terraced ground among alien wildlife that is each its own original design: a herd of three shaggy six legged grazing beasts with curled horns, fleeing, each twice the pilot's size; a lean angular striped predator with a long jaw charging at the pilot; a squat alien with a glowing green throat sac spitting a green glob; a long armoured segmented crawler with many legs; a wide shore crab with big claws at the water's edge; a tiny six legged critter scurrying; a huge rare spiny armoured beast three times the pilot's size; small pickups glinting on the ground where one fell: a folded hide, a shard of chitin, a glowing gland, a pulsing red gem",
    "creatures-harsh": f"{WILD}, standing on black volcanic rock with a glowing orange lava river, alien wildlife each its own original design: a squat alien with a glowing throat sac spitting a glob of acid at the pilot, two long armoured segmented crawlers with many legs closing in, a tiny six legged critter, a defeated creature lying on its side fading out, small pickups glinting on the ground: a shard of chitin and a glowing gland",
})

# The opening story's first screen (James, 2026-11-19: "a much clearer 'BEGIN' button right in the intro"): the press
# that lets the sound on, so the story is heard from its first word.
MOCKUPS.update({
    "intro-begin": "the first screen of a pixel art space game on a wide laptop screen: a deep dark violet and navy night sky full of tiny stars and a faint nebula, a small gold sun glowing far off at the left edge and a small dim red sun at the right edge, and in the exact middle one single large wide rectangular button with hard square corners, a thick bright gold double border and a dark night-blue fill, a small gold loudspeaker icon at its left end, a soft gold glow around it, a thin short line of small dim cream blocky lettering under the button, nothing else, lots of empty dark space, minimal and clean",
})

ap = argparse.ArgumentParser()
ap.add_argument("names", nargs="*")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--size", default="1280x720")
args = ap.parse_args()
width, height = (int(v) for v in args.size.split("x"))

for name in args.names or MOCKUPS:
    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr)
        time.sleep(3)
    out = os.path.join(OUT, name + (f"-{args.seed}" if args.seed != 1 else "") + ".png")
    start = time.time()
    comfy.txt2img(f"{STYLE}, {MOCKUPS[name]}", out, seed=args.seed, width=width, height=height)
    print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)")
