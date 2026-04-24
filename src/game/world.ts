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
})
