// Written by tools/audio/narration.py: every line the narrator has read, the words he read and how long it
// is (s). Never edited by hand.
export const TAKES: Record<string, { text: string; seconds: number }> = {
  title: {
    text: 'Xenophon: Twin Stars.',
    seconds: 2.11,
  },
  'intro-0': {
    text: 'Between a gold sun and a red one lie forty worlds.',
    seconds: 4.55,
  },
  'intro-1': {
    text: 'The war for the forty worlds has flared again. Nomarchy and Anarchoi squadrons are fighting over Drassel, in the core, for the third time this year.',
    seconds: 8.24,
  },
  'intro-2': {
    text: "Both sides pay well for ore, and raiders have learned that a ship shot down over open ground spills its hold for anyone to pick up. Ore is nobody's until it is banked at a friendly base.",
    seconds: 11.92,
  },
  'intro-3': {
    text: 'A world goes to the side with the most flags on its outpost mast, and both sides are short of pilots.',
    seconds: 7.92,
  },
  'intro-4': {
    text: 'The Nomarchy has opened its hangars on the Meridian Ring to anyone who will sign its register.',
    seconds: 5.59,
  },
  'intro-5': {
    text: 'The Anarchoi are handing out ships on the Raft to anyone who turns up.',
    seconds: 4.53,
  },
  'intro-6': {
    text: 'At the dock, a new pilot sits in a cold ship, waiting for clearance to launch...',
    seconds: 4.8,
  },
  'sortie-power-keys': {
    text: 'Your ship is docked at the station with its power off. Press P to power up. The screens take a couple of seconds to come on.',
    seconds: 7.36,
  },
  'sortie-power-ps': {
    text: 'Your ship is docked at the station with its power off. Press down on the d-pad to power up. The screens take a couple of seconds to come on.',
    seconds: 8.0,
  },
  'sortie-power-pad': {
    text: 'Your ship is docked at the station with its power off. Press down on the d-pad to power up. The screens take a couple of seconds to come on.',
    seconds: 7.84,
  },
  'sortie-power-touch': {
    text: 'Your ship is docked at the station with its power off. Tap the Power button to power up. The screens take a couple of seconds to come on.',
    seconds: 8.08,
  },
  'sortie-power-any': {
    text: 'Your ship is docked at the station with its power off. Press the power key shown in the box at the top. The screens take a couple of seconds to come on.',
    seconds: 9.76,
  },
  'sortie-launch-keys': {
    text: 'Now hold F to launch. F is your action key. It launches, lands, docks, and takes you down to worlds.',
    seconds: 6.72,
  },
  'sortie-launch-ps': {
    text: 'Now hold Circle to launch. Circle is your action button. It launches, lands, docks, and takes you down to worlds.',
    seconds: 7.65,
  },
  'sortie-launch-pad': {
    text: 'Now hold B to launch. B is your action button. It launches, lands, docks, and takes you down to worlds.',
    seconds: 7.07,
  },
  'sortie-launch-touch': {
    text: 'Now hold the Action button to launch. Action launches, lands, docks, and takes you down to worlds.',
    seconds: 6.53,
  },
  'sortie-launch-any': {
    text: 'Now hold your action key to launch. It launches, lands, docks, and takes you down to worlds.',
    seconds: 5.49,
  },
  'sortie-look-keys': {
    text: 'Press V to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
    seconds: 9.09,
  },
  'sortie-look-ps': {
    text: 'Press Triangle to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
    seconds: 8.05,
  },
  'sortie-look-pad': {
    text: 'Press the Y button to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
    seconds: 8.89,
  },
  'sortie-look-touch': {
    text: 'Tap More, then View, to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
    seconds: 9.75,
  },
  'sortie-look-any': {
    text: 'Press your view key to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
    seconds: 9.49,
  },
  'sortie-steer-keys': {
    text: "The arrow on screen points at your side's home world. Steer with the mouse, or A and D, and fly until you're over it. E opens the throttle and Q closes it.",
    seconds: 11.12,
  },
  'sortie-steer-ps': {
    text: "The arrow on screen points at your side's home world. Steer with the left stick, and fly until you're over it. The right stick sets the throttle.",
    seconds: 8.41,
  },
  'sortie-steer-pad': {
    text: "The arrow on screen points at your side's home world. Steer with the left stick, and fly until you're over it. The right stick sets the throttle.",
    seconds: 8.43,
  },
  'sortie-steer-touch': {
    text: "The arrow on screen points at your side's home world. Drag a finger to steer, and fly until you're over it.",
    seconds: 6.56,
  },
  'sortie-steer-any': {
    text: "The arrow on screen points at your side's home world. Steer towards it, and fly until you're over it.",
    seconds: 5.76,
  },
  'sortie-descend-keys': {
    text: "You're over the world now. Hold F to put the nose down, and keep diving through its air until you're flying over the ground.",
    seconds: 6.16,
  },
  'sortie-descend-ps': {
    text: "You're over the world now. Hold Circle to put the nose down, and keep diving through its air until you're flying over the ground.",
    seconds: 6.8,
  },
  'sortie-descend-pad': {
    text: "You're over the world now. Hold B to put the nose down, and keep diving through its air until you're flying over the ground.",
    seconds: 6.96,
  },
  'sortie-descend-touch': {
    text: "You're over the world now. Hold Action to put the nose down, and keep diving through its air until you're flying over the ground.",
    seconds: 6.64,
  },
  'sortie-descend-any': {
    text: "You're over the world now. Hold your action key to put the nose down, and keep diving through its air until you're flying over the ground.",
    seconds: 8.08,
  },
  'sortie-dive-keys': {
    text: 'Hold S to dive. You can only mine and land close to the ground, so get your height under ninety.',
    seconds: 6.27,
  },
  'sortie-dive-ps': {
    text: 'Push the left stick up to dive. You can only mine and land close to the ground, so get your height under ninety.',
    seconds: 7.09,
  },
  'sortie-dive-pad': {
    text: 'Push the left stick up to dive. You can only mine and land close to the ground, so get your height under ninety.',
    seconds: 7.28,
  },
  'sortie-dive-touch': {
    text: 'Hold the Dive button. You can only mine and land close to the ground, so get your height under ninety.',
    seconds: 6.67,
  },
  'sortie-dive-any': {
    text: 'Dive. You can only mine and land close to the ground, so get your height under ninety.',
    seconds: 4.91,
  },
  'sortie-drones-keys': {
    text: "Three training drones are up ahead. They don't shoot back. Click to fire your guns, and shoot all three down.",
    seconds: 6.47,
  },
  'sortie-drones-ps': {
    text: "Three training drones are up ahead. They don't shoot back. Hold R2 to fire your guns, and shoot all three down.",
    seconds: 6.21,
  },
  'sortie-drones-pad': {
    text: "Three training drones are up ahead. They don't shoot back. Hold the right trigger to fire your guns, and shoot all three down.",
    seconds: 6.87,
  },
  'sortie-drones-touch': {
    text: "Three training drones are up ahead. They don't shoot back. Hold Fire to fire your guns, and shoot all three down.",
    seconds: 6.79,
  },
  'sortie-drones-any': {
    text: "Three training drones are up ahead. They don't shoot back. Fire your guns, and shoot all three down.",
    seconds: 5.73,
  },
  'sortie-mine-keys': {
    text: "The marked rock is ore. Fly low over it and hold R to cut it with your mining laser. Then fly through the chunks that break off, and they're scooped into your hold.",
    seconds: 9.91,
  },
  'sortie-mine-ps': {
    text: "The marked rock is ore. Fly low over it and hold L1 to cut it with your mining laser. Then fly through the chunks that break off, and they're scooped into your hold.",
    seconds: 9.92,
  },
  'sortie-mine-pad': {
    text: "The marked rock is ore. Fly low over it and hold the left bumper to cut it with your mining laser. Then fly through the chunks that break off, and they're scooped into your hold.",
    seconds: 11.01,
  },
  'sortie-mine-touch': {
    text: "The marked rock is ore. Fly low over it and hold Mine to cut it with your mining laser. Then fly through the chunks that break off, and they're scooped into your hold.",
    seconds: 10.15,
  },
  'sortie-mine-any': {
    text: "The marked rock is ore. Fly low over it and hold your mining key to cut it with the laser. Then fly through the chunks that break off, and they're scooped into your hold.",
    seconds: 10.08,
  },
  'sortie-land-keys': {
    text: 'Now land. Fly to the pad shown on screen and hold F, low over it. Any flat ground will do as well.',
    seconds: 7.44,
  },
  'sortie-land-ps': {
    text: 'Now land. Fly to the pad shown on screen and hold Circle, low over it. Any flat ground will do as well.',
    seconds: 8.48,
  },
  'sortie-land-pad': {
    text: 'Now land. Fly to the pad shown on screen and hold B, low over it. Any flat ground will do as well.',
    seconds: 6.64,
  },
  'sortie-land-touch': {
    text: 'Now land. Fly to the pad shown on screen and hold Action, low over it. Any flat ground will do as well.',
    seconds: 7.76,
  },
  'sortie-land-any': {
    text: 'Now land. Fly to the pad shown on screen and hold your action key, low over it. Any flat ground will do as well.',
    seconds: 8.32,
  },
  'sortie-out-keys': {
    text: 'Tap F to climb out of your ship. On foot, you walk with W, A, S and D.',
    seconds: 6.16,
  },
  'sortie-out-ps': {
    text: 'Tap Circle to climb out of your ship. On foot, you walk with the left stick.',
    seconds: 4.56,
  },
  'sortie-out-pad': {
    text: 'Tap B to climb out of your ship. On foot, you walk with the left stick.',
    seconds: 4.72,
  },
  'sortie-out-touch': {
    text: 'Tap Action to climb out of your ship. On foot, drag a finger to walk.',
    seconds: 4.0,
  },
  'sortie-out-any': {
    text: 'Tap your action key to climb out of your ship.',
    seconds: 2.32,
  },
  'sortie-beacon-keys': {
    text: 'Press V to plant a beacon, and pick a message for it. Pilots who land here later will read it.',
    seconds: 5.68,
  },
  'sortie-beacon-ps': {
    text: 'Press Triangle to plant a beacon, and pick a message for it. Pilots who land here later will read it.',
    seconds: 6.16,
  },
  'sortie-beacon-pad': {
    text: 'Press Y to plant a beacon, and pick a message for it. Pilots who land here later will read it.',
    seconds: 5.68,
  },
  'sortie-beacon-touch': {
    text: 'Tap Beacon to plant a beacon, and pick a message for it. Pilots who land here later will read it.',
    seconds: 5.84,
  },
  'sortie-beacon-any': {
    text: 'Plant a beacon with your view key, and pick a message for it. Pilots who land here later will read it.',
    seconds: 5.6,
  },
  'sortie-board-keys': {
    text: 'Walk back to your ship and press F to climb in.',
    seconds: 2.72,
  },
  'sortie-board-ps': {
    text: 'Walk back to your ship and press Circle to climb in.',
    seconds: 3.2,
  },
  'sortie-board-pad': {
    text: 'Walk back to your ship and press B to climb in.',
    seconds: 2.96,
  },
  'sortie-board-touch': {
    text: 'Walk back to your ship and tap Action to climb in.',
    seconds: 3.53,
  },
  'sortie-board-any': {
    text: 'Walk back to your ship and press your action key to climb in.',
    seconds: 2.96,
  },
  'sortie-bank-keys': {
    text: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Hold F to take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
    seconds: 15.04,
  },
  'sortie-bank-ps': {
    text: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Hold Circle to take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
    seconds: 14.63,
  },
  'sortie-bank-pad': {
    text: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Hold B to take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
    seconds: 15.33,
  },
  'sortie-bank-touch': {
    text: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Hold Action to take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
    seconds: 14.21,
  },
  'sortie-bank-any': {
    text: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
    seconds: 15.33,
  },
  'sortie-free-keys': {
    text: "That's the end of the training flight. Press M for the map. The marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
    seconds: 10.53,
  },
  'sortie-free-ps': {
    text: "That's the end of the training flight. Press the touchpad for the map. The marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
    seconds: 11.01,
  },
  'sortie-free-pad': {
    text: "That's the end of the training flight. Press Back for the map. The marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
    seconds: 9.85,
  },
  'sortie-free-touch': {
    text: "That's the end of the training flight. Tap More, then Map, for the map. The marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
    seconds: 10.83,
  },
  'sortie-free-any': {
    text: "That's the end of the training flight. Open the map: the marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
    seconds: 9.69,
  },
}
