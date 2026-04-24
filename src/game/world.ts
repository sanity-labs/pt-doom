import {PLAYER_MAX_HP, MAX_AMMO} from './constants'

export const MAP: string[] = [
  '################',
  '#..............#',
  '#.####.#####...#',
  '#.#........#...#',
  '#.#..#####.#...#',
  '#.#........#...#',
  '#.####.#####...#',
  '#..............#',
  '#..###.......#.#',
  '#.............##',
  '#....###.......#',
  '#..........###.#',
  '#.#########....#',
  '#..............#',
  '#..............#',
  '################',
]

export const MAP_W = MAP[0].length
export const MAP_H = MAP.length

export const isWall = (x: number, y: number): boolean => {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  if (ix < 0 || iy < 0 || ix >= MAP_W || iy >= MAP_H) return true
  return MAP[iy][ix] === '#'
}

export type Enemy = {
  id: number
  x: number
  y: number
  hp: number
  dead: boolean
  hitFlash: number // frames remaining of red flash
}

export type Pickup = {
  id: number
  x: number
  y: number
  kind: 'ammo-small' | 'ammo-large' | 'medkit'
  taken: boolean
}

export type GameState = {
  t: number // total seconds elapsed
  lastTickMs: number
  phase: 'title' | 'playing' | 'dead' | 'win'
  paused?: boolean
  px: number
  py: number
  pa: number // player angle, radians
  hp: number
  ammo: number
  score: number
  kills: number
  keys: Map<string, number> // key -> last seen timestamp (ms). Stale entries auto-expire.
  muzzleFlash: number // frames remaining
  damageFlash: number
  message: string
  messageFramesLeft: number
  enemies: Enemy[]
  pickups: Pickup[]
  wave: number // 1-indexed wave counter; increments when a wave is cleared
  startMs: number // ms timestamp when playing started; used for title-screen lockout
}

export const makeInitialState = (): GameState => ({
  t: 0,
  lastTickMs: 0,
  phase: 'title',
  px: 1.5,
  py: 1.5,
  pa: 0, // facing east along the top corridor

  hp: PLAYER_MAX_HP,
  ammo: MAX_AMMO,
  score: 0,
  kills: 0,
  keys: new Map(),
  muzzleFlash: 0,
  damageFlash: 0,
  message: '',
  messageFramesLeft: 0,
  startMs: 0,
  wave: 1,
  enemies: [
    // Close ambush for immediate "3D enemy in view" moment, then pepper
    // the rest across the map.
    {id: 1, x: 6.5, y: 1.5, hp: 3, dead: false, hitFlash: 0},
    {id: 2, x: 12.5, y: 1.5, hp: 3, dead: false, hitFlash: 0},
    {id: 3, x: 13.5, y: 9.5, hp: 3, dead: false, hitFlash: 0},
    {id: 4, x: 4.5, y: 10.5, hp: 3, dead: false, hitFlash: 0},
    {id: 5, x: 7.5, y: 13.5, hp: 3, dead: false, hitFlash: 0},
    {id: 6, x: 11.5, y: 13.5, hp: 3, dead: false, hitFlash: 0},
  ],
  pickups: [
    {id: 1, x: 13.5, y: 1.5,  kind: 'ammo-large', taken: false}, // end of top corridor
    {id: 2, x: 4.5,  y: 3.5,  kind: 'ammo-small', taken: false}, // tucked in the cross
    {id: 3, x: 2.5,  y: 8.5,  kind: 'medkit',     taken: false}, // middle-left
    {id: 4, x: 14.5, y: 7.5,  kind: 'ammo-small', taken: false}, // right column
    {id: 5, x: 14.5, y: 13.5, kind: 'ammo-large', taken: false}, // far south-east
    {id: 6, x: 1.5,  y: 14.5, kind: 'medkit',     taken: false}, // far south-west
  ],
})
