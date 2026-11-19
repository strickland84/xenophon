// Names for systems, worlds and moons, made from syllable tables in three voices: the
// Nomarchy's (long and formal: Saint Verane, Caldera IV), the Anarchoi's (short and blunt:
// Rustwater, Last Kettle), and a plain one for everything between their home systems. The
// first pilot to land on a world will be able to rename it (the plan's section 13).

export type Voice = 'nomarchy' | 'anarchoi' | 'neutral'

type Rnd = () => number
const pick = <T>(rnd: Rnd, list: readonly T[]) => list[Math.floor(rnd() * list.length)]

// the Nomarchy: old house names, saints, ports and numerals
const C_START = [
  'Ver',
  'Cal',
  'Aur',
  'Ser',
  'Val',
  'Mer',
  'Ast',
  'Cor',
  'Lum',
  'Hal',
  'Ond',
  'Ther',
  'Sol',
  'Cass',
  'El',
  'Mar',
  'Adr',
  'Bel',
  'Cel',
  'Ves',
  'Ise',
  'Lor',
  'Pell',
  'Tar',
]
const C_MID = ['', '', 'a', 'e', 'i', 'an', 'el', 'er', 'or']
const C_END = [
  'ane',
  'dera',
  'ia',
  'ence',
  'ium',
  'ora',
  'elle',
  'anth',
  'is',
  'ova',
  'aine',
  'essa',
  'ire',
  'onde',
  'ade',
  'ion',
  'ast',
  'ine',
]
const C_FORM = ['Saint #', '# #N', '# Prime', 'New #', 'Port #', '# Regis', 'Fort #', '# Major', '#', '#']
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

// the Anarchoi: two blunt words, run together or not
const D_FIRST = [
  'Rust',
  'Last',
  'Black',
  'Cold',
  'Dry',
  'Iron',
  'Salt',
  'Scrap',
  'Tin',
  'Grit',
  'Ash',
  'Bent',
  'Dead',
  'Low',
  'Red',
  'Smoke',
  'Hook',
  'Slag',
  'Burnt',
  'Sour',
  'Lucky',
  'Broke',
  'Hollow',
  'Cinder',
  'Wreck',
  'Stray',
]
const D_SECOND = [
  'water',
  'kettle',
  'hold',
  'yard',
  'rock',
  'hole',
  'nail',
  'reach',
  'tooth',
  'pit',
  'stack',
  'spit',
  'drum',
  'heap',
  'gut',
  'bucket',
  'flat',
  'wash',
  'jaw',
  'end',
  'light',
  'knot',
  'lamp',
  'hook',
]

// between: plain syllables
const N_START = [
  'Ka',
  'Te',
  'I',
  'Ve',
  'Lu',
  'O',
  'Sa',
  'Mi',
  'Do',
  'Qu',
  'Ze',
  'Tho',
  'Ri',
  'Va',
  'U',
  'Ma',
  'Os',
  'Ta',
  'Ny',
  'A',
  'Ix',
  'Ce',
  'Pha',
  'Li',
  'Dra',
  'Go',
  'Ha',
  'Ne',
  'Bo',
  'Yr',
  'E',
  'Kho',
]
const N_MID = ['', '', 'ra', 'ne', 'li', 'sa', 'to', 'mi', 'ka', 'lo', 'de', 'ri', 'vo', 'ba']
const N_END = [
  'n',
  'r',
  's',
  'th',
  'x',
  'l',
  'ssel',
  'nd',
  'rk',
  'ra',
  'ne',
  'os',
  'is',
  'ar',
  'el',
  'on',
  'ix',
  'um',
  'ea',
  'ia',
  'ek',
  'und',
]

/** a root in the Nomarchy's voice */
const nomarchyRoot = (rnd: Rnd) => pick(rnd, C_START) + pick(rnd, C_MID) + pick(rnd, C_END)

/** a name in one of the three voices; `nth` is the body's place round its sun (for numerals) */
export function makeName(rnd: Rnd, voice: Voice, nth = 0): string {
  if (voice === 'nomarchy') {
    const form = pick(rnd, C_FORM)
    let root = nomarchyRoot(rnd)
    // (a doubled form, "# #N", is a root and a numeral)
    if (form === '# #N') return `${root} ${ROMAN[Math.min(nth, ROMAN.length - 1)]}`
    root = form.replace('#', root)
    return root
  }
  if (voice === 'anarchoi') {
    const a = pick(rnd, D_FIRST)
    const b = pick(rnd, D_SECOND)
    return rnd() < 0.55 ? a + b : `${a} ${b[0].toUpperCase()}${b.slice(1)}`
  }
  const name = pick(rnd, N_START) + pick(rnd, N_MID) + pick(rnd, N_END)
  return name.length < 4 ? name + pick(rnd, N_END) : name
}

/** a name in a voice that no other name in `taken` has yet (it is added to `taken`) */
export function uniqueName(rnd: Rnd, voice: Voice, taken: Set<string>, nth = 0) {
  for (let tries = 0; tries < 50; tries++) {
    const name = makeName(rnd, voice, nth)
    if (!taken.has(name)) {
      taken.add(name)
      return name
    }
  }
  // (never in practice: a numbered fallback)
  let n = 2
  const base = makeName(rnd, voice, nth)
  while (taken.has(`${base} ${n}`)) n++
  taken.add(`${base} ${n}`)
  return `${base} ${n}`
}
