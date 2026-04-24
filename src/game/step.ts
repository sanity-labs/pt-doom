import {
  MOVE_SPEED,
  STRAFE_SPEED,
  TURN_SPEED,
  ENEMY_SPEED,
  ENEMY_FIRE_RANGE,
  ENEMY_FIRE_CHANCE,
  PLAYER_MAX_HP,
  SHOT_RANGE,
  FOV,
} from './constants'
import {isWall, type GameState} from './world'

const tryMove = (state: GameState, nx: number, ny: number) => {
  // simple collision: only move on each axis if the target is clear
  const pad = 0.25
  if (!isWall(nx + Math.sign(nx - state.px) * pad, state.py)) state.px = nx
  if (!isWall(state.px, ny + Math.sign(ny - state.py) * pad)) state.py = ny
}

// Keys auto-expire if we haven't seen a keydown for them in the last 120ms.
// Browsers re-fire keydown while a key is held at ~30-60 Hz, so anything
// older than 120ms is almost certainly a stuck key and should be ignored.
const KEY_STALE_MS = 150
const has = (state: GameState, k: string) => {
  const t = state.keys.get(k)
  if (t === undefined) return false
  if (performance.now() - t > KEY_STALE_MS) {
    state.keys.delete(k)
    return false
  }
  return true
}

const hasLineOfSight = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean => {
  const dx = toX - fromX
  const dy = toY - fromY
  const len = Math.sqrt(dx * dx + dy * dy)
  const steps = Math.ceil(len * 4)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (isWall(fromX + dx * t, fromY + dy * t)) return false
  }
  return true
}

export const step = (state: GameState, dt: number) => {
  if (state.phase !== 'playing') return
  if (state.paused) return

  state.t += dt

  // Turning (arrow left/right, q/e)
  if (has(state, 'ArrowLeft') || has(state, 'q')) state.pa -= TURN_SPEED * dt
  if (has(state, 'ArrowRight') || has(state, 'e')) state.pa += TURN_SPEED * dt

  // Forward/back (w/s, arrow up/down)
  const fwd = (has(state, 'w') || has(state, 'ArrowUp') ? 1 : 0) - (has(state, 's') || has(state, 'ArrowDown') ? 1 : 0)
  const strafe = (has(state, 'd') ? 1 : 0) - (has(state, 'a') ? 1 : 0)

  if (fwd) {
    const nx = state.px + Math.cos(state.pa) * MOVE_SPEED * dt * fwd
    const ny = state.py + Math.sin(state.pa) * MOVE_SPEED * dt * fwd
    tryMove(state, nx, ny)
  }
  if (strafe) {
    const nx = state.px + Math.cos(state.pa + Math.PI / 2) * STRAFE_SPEED * dt * strafe
    const ny = state.py + Math.sin(state.pa + Math.PI / 2) * STRAFE_SPEED * dt * strafe
    tryMove(state, nx, ny)
  }

  // Enemies
  for (const e of state.enemies) {
    if (e.dead) continue
    if (e.hitFlash > 0) e.hitFlash--

    const dx = state.px - e.x
    const dy = state.py - e.y
    const distSq = dx * dx + dy * dy
    const dist = Math.sqrt(distSq)

    if (hasLineOfSight(e.x, e.y, state.px, state.py)) {
      // chase
      if (dist > 1.2) {
        const ndx = dx / dist
        const ndy = dy / dist
        const tx = e.x + ndx * ENEMY_SPEED * dt
        const ty = e.y + ndy * ENEMY_SPEED * dt
        if (!isWall(tx, e.y)) e.x = tx
        if (!isWall(e.x, ty)) e.y = ty
      }
      // shoot if close
      if (dist < ENEMY_FIRE_RANGE && Math.random() < ENEMY_FIRE_CHANCE) {
        state.hp -= 4
        state.damageFlash = 4
        if (state.hp <= 0) {
          state.hp = 0
          state.phase = 'dead'
          state.message = 'YOU DIED — press R to restart'
          state.messageFramesLeft = 9999
        }
      }
    }
  }

  // Decay flashes
  if (state.muzzleFlash > 0) state.muzzleFlash--
  if (state.damageFlash > 0) state.damageFlash--
  if (state.messageFramesLeft > 0) state.messageFramesLeft--

  // Win condition
  if (state.enemies.every((e) => e.dead) && state.phase === 'playing') {
    state.phase = 'win'
    state.message = 'ALL DEMONS CLEARED — press R to replay'
    state.messageFramesLeft = 9999
  }
}

export const fireShot = (state: GameState) => {
  if (state.phase !== 'playing') return
  if (state.ammo <= 0) {
    state.message = '*click* — out of ammo'
    state.messageFramesLeft = 60
    return
  }
  state.ammo--
  state.muzzleFlash = 3

  // Find nearest enemy within small angle and line of sight
  let best: {id: number; dist: number} | null = null
  for (const e of state.enemies) {
    if (e.dead) continue
    const dx = e.x - state.px
    const dy = e.y - state.py
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > SHOT_RANGE) continue
    const enemyAngle = Math.atan2(dy, dx)
    let diff = enemyAngle - state.pa
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    // hit cone: narrower than FOV, widens slightly with distance
    const cone = Math.min(0.25, 0.06 + dist * 0.01)
    if (Math.abs(diff) > cone) continue
    if (!hasLineOfSight(state.px, state.py, e.x, e.y)) continue
    if (!best || dist < best.dist) best = {id: e.id, dist}
  }

  if (best) {
    const e = state.enemies.find((x) => x.id === best!.id)!
    e.hp--
    e.hitFlash = 5
    if (e.hp <= 0) {
      e.dead = true
      state.kills++
      state.score += 100
      state.message = `+100  DEMON DOWN (${state.kills}/${state.enemies.length})`
      state.messageFramesLeft = 40
    }
  }
}

export const resetGame = (state: GameState) => {
  state.px = 1.5
  state.py = 1.5
  state.pa = 0
  state.hp = PLAYER_MAX_HP
  state.ammo = 30
  state.score = 0
  state.kills = 0
  state.muzzleFlash = 0
  state.damageFlash = 0
  state.message = ''
  state.messageFramesLeft = 0
  state.phase = 'playing'
  for (const e of state.enemies) {
    e.hp = 3
    e.dead = false
    e.hitFlash = 0
  }
  // reset positions
  const spawns: Array<[number, number]> = [
    [6.5, 1.5], [12.5, 1.5], [13.5, 9.5],
    [4.5, 10.5], [7.5, 13.5], [11.5, 13.5],
  ]
  for (let i = 0; i < state.enemies.length; i++) {
    state.enemies[i].x = spawns[i]?.[0] ?? state.enemies[i].x
    state.enemies[i].y = spawns[i]?.[1] ?? state.enemies[i].y
  }
}
