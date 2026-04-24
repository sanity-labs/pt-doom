export const WIDTH = 80
export const HEIGHT = 22 // leaves 2 rows for HUD (top title, bottom status)
export const VIEW_HEIGHT = HEIGHT - 2
export const FOV = Math.PI / 3
export const MAX_DEPTH = 20
export const MOVE_SPEED = 3.0 // tiles per second
export const STRAFE_SPEED = 2.5
export const TURN_SPEED = 2.2 // radians per second
export const ENEMY_SPEED = 1.1
export const ENEMY_FIRE_RANGE = 7
export const ENEMY_FIRE_CHANCE = 0.015 // per frame when line-of-sight
export const PLAYER_MAX_HP = 100
export const MAX_AMMO = 30
export const SHOT_RANGE = 16

// Pickups
export const PICKUP_RADIUS = 0.55 // player grabs a pickup when within this radius
export const AMMO_SMALL = 10
export const AMMO_LARGE = 25
export const MEDKIT_HP = 25

// The classic 70-char ASCII brightness ramp (dark → light) borrowed from
// Paul Bourke / doom-ascii. Index 0 is darkest, last index is brightest.
// We use it as our shading primitive for walls, floor, ceiling and sprites.
export const BRIGHTNESS_RAMP =
  ` .'\`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$`
// Length-1 precomputed so we can index safely.
export const RAMP_MAX = BRIGHTNESS_RAMP.length - 1

// When building each column, we pick from the ramp based on computed
// brightness in [0,1] where 1 is close/bright and 0 is far/dark.
export const ramp = (b: number): string => {
  const clamped = Math.max(0, Math.min(1, b))
  return BRIGHTNESS_RAMP[Math.floor(clamped * RAMP_MAX)]
}

// Wall ramp: N/S walls are slightly brighter than E/W walls (lighting trick
// stolen from Wolfenstein 3D — it gives adjacent walls different shading so
// corners read as corners).
export const wallRamp = (dist: number, side: number): string => {
  // brightness falls off with distance. quadratic for a juicier feel.
  const t = Math.max(0, 1 - dist / MAX_DEPTH)
  const b = t * t
  const sideBoost = side === 0 ? 0.15 : 0 // N/S walls are 15% brighter
  return ramp(Math.min(1, b * 0.9 + sideBoost))
}

export const floorRamp = (rowDist: number): string => {
  // rowDist grows toward the edges; brightness = near horizon is dim, near
  // camera is brighter (floor close to player).
  const t = Math.max(0, 1 - rowDist / (MAX_DEPTH * 0.6))
  return ramp(t * 0.55) // keep floors dim so walls pop
}

export const ceilRamp = (rowDist: number): string => {
  // ceiling is darker than floor — gives a sense of sky vs. ground
  const t = Math.max(0, 1 - rowDist / (MAX_DEPTH * 0.5))
  return ramp(t * 0.32)
}

export const enemyRamp = (dist: number, flash = false): string => {
  if (flash) return '@' // near-max-brightness splat when hit
  const t = Math.max(0, 1 - dist / 12)
  return ramp(0.35 + t * 0.6)
}
