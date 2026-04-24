import {
  WIDTH,
  VIEW_HEIGHT,
  FOV,
  wallRamp,
  floorRamp,
  ceilRamp,
  enemyRamp,
} from './constants'
import {isWall, type GameState, type Enemy, type Pickup} from './world'

export type Cell = {ch: string; kind: CellKind}
export type CellKind =
  | 'ceiling'
  | 'wall-ns'
  | 'wall-ew'
  | 'floor'
  | 'enemy'
  | 'pickup'
  | 'medkit'
  | 'crosshair'
  | 'flash'

export type Frame = {
  cells: Cell[][] // [row][col]
  zBuffer: number[] // distance per column
}

// DDA raycast — returns perpendicular distance and which side (0 = NS wall, 1 = EW wall)
function castRay(px: number, py: number, rayAngle: number): {dist: number; side: number} {
  const dirX = Math.cos(rayAngle)
  const dirY = Math.sin(rayAngle)

  let mapX = Math.floor(px)
  let mapY = Math.floor(py)

  const deltaDistX = Math.abs(1 / (dirX || 1e-9))
  const deltaDistY = Math.abs(1 / (dirY || 1e-9))

  let sideDistX: number
  let sideDistY: number
  let stepX: number
  let stepY: number

  if (dirX < 0) {
    stepX = -1
    sideDistX = (px - mapX) * deltaDistX
  } else {
    stepX = 1
    sideDistX = (mapX + 1.0 - px) * deltaDistX
  }
  if (dirY < 0) {
    stepY = -1
    sideDistY = (py - mapY) * deltaDistY
  } else {
    stepY = 1
    sideDistY = (mapY + 1.0 - py) * deltaDistY
  }

  let side = 0
  let hit = false
  let iter = 0
  while (!hit && iter < 64) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX
      mapX += stepX
      side = 0
    } else {
      sideDistY += deltaDistY
      mapY += stepY
      side = 1
    }
    if (isWall(mapX, mapY)) hit = true
    iter++
  }

  const dist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY
  return {dist: Math.max(0.0001, dist), side}
}

export function renderFrame(state: GameState): Frame {
  const cells: Cell[][] = []
  for (let y = 0; y < VIEW_HEIGHT; y++) {
    const row: Cell[] = []
    for (let x = 0; x < WIDTH; x++) {
      row.push({ch: ' ', kind: 'ceiling'})
    }
    cells.push(row)
  }
  const zBuffer = new Array<number>(WIDTH).fill(Infinity)

  for (let col = 0; col < WIDTH; col++) {
    const cameraX = (2 * col) / WIDTH - 1
    const rayAngle = state.pa + Math.atan(cameraX * Math.tan(FOV / 2))
    const {dist, side} = castRay(state.px, state.py, rayAngle)

    const perpDist = dist * Math.cos(rayAngle - state.pa)
    zBuffer[col] = perpDist

    const lineH = Math.floor(VIEW_HEIGHT / Math.max(0.2, perpDist))
    const drawStart = Math.max(0, Math.floor(VIEW_HEIGHT / 2 - lineH / 2))
    const drawEnd = Math.min(VIEW_HEIGHT - 1, Math.floor(VIEW_HEIGHT / 2 + lineH / 2))

    // Ceiling
    for (let y = 0; y < drawStart; y++) {
      const rowDist = VIEW_HEIGHT / (2.0 * (VIEW_HEIGHT / 2 - y) || 1)
      cells[y][col] = {ch: ceilRamp(Math.abs(rowDist)), kind: 'ceiling'}
    }

    // Wall column — pick shading from ramp by distance, add subtle vertical
    // variation so bricks read as bricks rather than a flat slab.
    const baseCh = wallRamp(perpDist, side)
    for (let y = drawStart; y <= drawEnd; y++) {
      // slight darkening toward top/bottom of the wall slice for fake AO
      const edge = Math.min(y - drawStart, drawEnd - y) / Math.max(1, (drawEnd - drawStart) / 2)
      const edgeBoost = Math.min(1, edge * 1.2)
      const ch = edgeBoost < 0.25 ? dimChar(baseCh) : baseCh
      cells[y][col] = {ch, kind: side === 0 ? 'wall-ns' : 'wall-ew'}
    }

    // Floor
    for (let y = drawEnd + 1; y < VIEW_HEIGHT; y++) {
      const rowDist = VIEW_HEIGHT / (2.0 * (y - VIEW_HEIGHT / 2) || 1)
      cells[y][col] = {ch: floorRamp(Math.abs(rowDist)), kind: 'floor'}
    }
  }

  // Combined sprite pass: enemies + pickups, back→front so nearer items
  // overdraw farther ones correctly.
  type Drawable =
    | {kind: 'enemy'; e: Enemy; distSq: number}
    | {kind: 'pickup'; p: Pickup; distSq: number}
  const drawables: Drawable[] = []
  for (const e of state.enemies) {
    if (e.dead) continue
    const dx = e.x - state.px
    const dy = e.y - state.py
    drawables.push({kind: 'enemy', e, distSq: dx * dx + dy * dy})
  }
  for (const p of state.pickups) {
    if (p.taken) continue
    const dx = p.x - state.px
    const dy = p.y - state.py
    drawables.push({kind: 'pickup', p, distSq: dx * dx + dy * dy})
  }
  drawables.sort((a, b) => b.distSq - a.distSq)

  for (const d of drawables) {
    if (d.kind === 'enemy') drawEnemy(cells, zBuffer, state, d.e)
    else drawPickup(cells, zBuffer, state, d.p)
  }

  return {cells, zBuffer}
}

// Step one char darker on the ramp (crude — just uses a short lookup).
const DIM_LOOKUP: Record<string, string> = {
  $: '@', '@': '8', '8': '&', '&': 'W', W: 'M', M: '#', '#': 'a', a: 'o',
  o: 'u', u: 't', t: 'f', f: 'j', j: 'i', i: '!',
}
function dimChar(c: string): string {
  return DIM_LOOKUP[c] ?? c
}

function drawEnemy(
  cells: Cell[][],
  zBuffer: number[],
  state: GameState,
  e: Enemy,
) {
  const dx = e.x - state.px
  const dy = e.y - state.py

  // Camera-space transform: camera forward = (cos pa, sin pa).
  //   depth  = forward·offset = dx cos + dy sin
  //   side   = right·offset   = -dx sin + dy cos
  const depth = dx * Math.cos(state.pa) + dy * Math.sin(state.pa)
  const side = -dx * Math.sin(state.pa) + dy * Math.cos(state.pa)
  const camY = depth
  const camX = side

  if (camY <= 0.2) return

  const screenX = Math.floor((WIDTH / 2) * (1 + camX / camY / Math.tan(FOV / 2)))
  // Scale enemy to roughly match wall height at the same distance, then
  // stretch horizontally so a human-shaped silhouette reads on the screen.
  const size = Math.max(3, Math.floor(VIEW_HEIGHT / camY))
  const halfW = Math.max(2, Math.floor(size * 0.65))
  const halfH = Math.max(2, Math.floor(size * 0.75))

  const startX = screenX - halfW
  const endX = screenX + halfW
  const startY = Math.floor(VIEW_HEIGHT / 2 - halfH)
  const endY = Math.floor(VIEW_HEIGHT / 2 + halfH)

  const flash = e.hitFlash > 0
  const dist = Math.sqrt(dx * dx + dy * dy)

  // Pick a sprite: 4 rows tall, stretched/scaled to the sprite size on screen.
  // Chunky chars so the demon reads clearly even against busy walls.
  const sprite = flash ? SPRITE_FLASH : pickSprite(dist)
  const spriteRows = sprite.length
  const spriteCols = sprite[0].length

  for (let sx = startX; sx <= endX; sx++) {
    if (sx < 0 || sx >= WIDTH) continue
    if (zBuffer[sx] <= camY) continue
    const u = Math.floor(((sx - startX) / Math.max(1, endX - startX)) * (spriteCols - 1))
    for (let sy = startY; sy <= endY; sy++) {
      if (sy < 0 || sy >= VIEW_HEIGHT) continue
      const v = Math.floor(((sy - startY) / Math.max(1, endY - startY)) * (spriteRows - 1))
      const ch = sprite[v][u]
      if (ch === ' ') continue
      cells[sy][sx] = {ch, kind: 'enemy'}
    }
  }
}

// Chunky ASCII demon sprites. The silhouette is obvious, the glyphs are
// visually distinct from wall shading characters so the red pops.
const SPRITE_NEAR = [
  '  ▄▀▀▀▀▄  ',
  ' ██▓▓▓▓██ ',
  ' ██O██O██ ',
  '  ██▀▀██  ',
  ' ███▄▄███ ',
  '  █ ██ █  ',
]
const SPRITE_MID = [
  '  ▄▀▀▄  ',
  ' ▓▓▓▓▓▓ ',
  ' ▓O▀▀O▓ ',
  '  ▓▓▓▓  ',
  '  █  █  ',
]
const SPRITE_FAR = [
  '  ██  ',
  ' ████ ',
  ' ████ ',
  '  ██  ',
]
const SPRITE_FLASH = [
  ' ▓██▓██▓▓ ',
  '██████████',
  '██████████',
  '██▓██▓███ ',
  ' ▓██████▓ ',
]

function pickSprite(dist: number): string[] {
  if (dist < 4) return SPRITE_NEAR
  if (dist < 9) return SPRITE_MID
  return SPRITE_FAR
}

// Pickups: low-to-the-floor crates (ammo) or medkits. Billboarded like enemies
// but scaled to floor-height so they read as "on the ground".
const CRATE_SPRITE = [
  '╔══════╗',
  '║AMMO  ║',
  '║◆◆◆◆◆◆║',
  '╚══════╝',
]
const CRATE_SPRITE_LARGE = [
  '╔══════════╗',
  '║  AMMO ++ ║',
  '║◆◆◆◆◆◆◆◆◆◆║',
  '║◆◆◆◆◆◆◆◆◆◆║',
  '╚══════════╝',
]
const MEDKIT_SPRITE = [
  '┌──────┐',
  '│  +   │',
  '│ +++  │',
  '│  +   │',
  '└──────┘',
]

function drawPickup(
  cells: Cell[][],
  zBuffer: number[],
  state: GameState,
  p: Pickup,
) {
  const dx = p.x - state.px
  const dy = p.y - state.py

  const depth = dx * Math.cos(state.pa) + dy * Math.sin(state.pa)
  const side = -dx * Math.sin(state.pa) + dy * Math.cos(state.pa)
  if (depth <= 0.2) return

  const screenX = Math.floor((WIDTH / 2) * (1 + side / depth / Math.tan(FOV / 2)))
  // crates are short — about 1/3 the height of a wall at that distance
  const wallH = Math.floor(VIEW_HEIGHT / depth)
  const sprite =
    p.kind === 'medkit'
      ? MEDKIT_SPRITE
      : p.kind === 'ammo-large'
        ? CRATE_SPRITE_LARGE
        : CRATE_SPRITE
  const spriteRows = sprite.length
  const spriteCols = sprite[0].length

  const halfH = Math.max(1, Math.floor(wallH * 0.22))
  const halfW = Math.max(2, Math.floor(wallH * 0.32))

  const startX = screenX - halfW
  const endX = screenX + halfW
  // anchor to the floor line (matches the bottom of the wall slab)
  const floorLine = Math.floor(VIEW_HEIGHT / 2 + wallH / 2)
  const endY = Math.min(VIEW_HEIGHT - 1, floorLine - 1)
  const startY = Math.max(0, endY - halfH * 2)

  const kindCell: CellKind = p.kind === 'medkit' ? 'medkit' : 'pickup'

  for (let sx = startX; sx <= endX; sx++) {
    if (sx < 0 || sx >= WIDTH) continue
    if (zBuffer[sx] <= depth) continue // occluded by wall
    const u = Math.floor(((sx - startX) / Math.max(1, endX - startX)) * (spriteCols - 1))
    for (let sy = startY; sy <= endY; sy++) {
      if (sy < 0 || sy >= VIEW_HEIGHT) continue
      const v = Math.floor(((sy - startY) / Math.max(1, endY - startY)) * (spriteRows - 1))
      const ch = sprite[v][u]
      if (ch === ' ') continue
      cells[sy][sx] = {ch, kind: kindCell}
    }
  }
}
