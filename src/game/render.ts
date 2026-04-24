import {WIDTH, VIEW_HEIGHT, PLAYER_MAX_HP, MAX_AMMO} from './constants'
import {renderFrame, type Cell} from './raycast'
import {MAP, MAP_W, MAP_H, type GameState} from './world'

type Run = {text: string; kind: Cell['kind']}

const runsFromRow = (row: Cell[]): Run[] => {
  const runs: Run[] = []
  let cur: Run | null = null
  for (const cell of row) {
    if (!cur || cur.kind !== cell.kind) {
      cur = {text: cell.ch, kind: cell.kind}
      runs.push(cur)
    } else {
      cur.text += cell.ch
    }
  }
  return runs
}

let blockCounter = 0
const nextKey = () => `b${++blockCounter}`
const nextSpanKey = () => `s${++blockCounter}`

type Block = {
  _type: 'block'
  _key: string
  style: 'normal'
  markDefs: []
  children: Array<{
    _type: 'span'
    _key: string
    text: string
    marks: string[]
  }>
}

const mkBlock = (runs: Run[]): Block => ({
  _type: 'block',
  _key: nextKey(),
  style: 'normal',
  markDefs: [],
  children: runs.map((r) => ({
    _type: 'span',
    _key: nextSpanKey(),
    text: r.text.length ? r.text : ' ',
    marks: markForKind(r.kind),
  })),
})

const markForKind = (kind: Cell['kind']): string[] => {
  switch (kind) {
    case 'wall-ns': return ['walln']
    case 'wall-ew': return ['walle']
    case 'enemy': return ['enemy']
    case 'floor': return ['floor']
    case 'ceiling': return ['ceil']
    case 'crosshair': return ['cross']
    case 'flash': return ['flash']
  }
}

const pad = (s: string, n: number) => {
  if (s.length >= n) return s.slice(0, n)
  return s + ' '.repeat(n - s.length)
}

const buildMinimap = (state: GameState): string[] => {
  const lines: string[] = []
  for (let y = 0; y < MAP_H; y++) {
    let line = ''
    for (let x = 0; x < MAP_W; x++) {
      if (Math.floor(state.px) === x && Math.floor(state.py) === y) {
        // orient arrow based on facing
        const a = ((state.pa % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        if (a < Math.PI / 8 || a >= 15 * Math.PI / 8) line += '▶'
        else if (a < 3 * Math.PI / 8) line += '▼'
        else if (a < 5 * Math.PI / 8) line += '▼'
        else if (a < 7 * Math.PI / 8) line += '◀'
        else if (a < 9 * Math.PI / 8) line += '◀'
        else if (a < 11 * Math.PI / 8) line += '▲'
        else if (a < 13 * Math.PI / 8) line += '▲'
        else line += '▶'
      } else if (state.enemies.some((e) => !e.dead && Math.floor(e.x) === x && Math.floor(e.y) === y)) {
        line += '✕'
      } else {
        line += MAP[y][x] === '#' ? '█' : ' '
      }
    }
    lines.push(line)
  }
  return lines
}

// Classic DOOM face — chooses a face sprite based on HP band and hurt flash.
const faceArt = (state: GameState): string[] => {
  const hpPct = state.hp / PLAYER_MAX_HP
  const hurt = state.damageFlash > 0
  if (state.phase === 'dead') return [
    '  .---.  ',
    ' (x x X) ',
    '  |   |  ',
    '   ^^^   ',
  ]
  if (hurt || hpPct < 0.25) return [
    '  .---.  ',
    ' (>_<)|  ',
    "  \\_/   ",
    "  |||    ",
  ]
  if (hpPct < 0.6) return [
    '  .---.  ',
    ' (o.o)|  ',
    '  |-|    ',
    '  |||    ',
  ]
  return [
    '  .---.  ',
    ' (^.^)|  ',
    '  |u|    ',
    '  |||    ',
  ]
}

const buildTitleBar = (state: GameState): string => {
  const left = ' PT-DOOM ▌ portable-text first-person shooter '
  const phase = state.phase.toUpperCase()
  const mid = ` ▌ ${phase} ▌ `
  const right = ` t=${state.t.toFixed(1)}s `
  const total = WIDTH
  const filler = Math.max(0, total - left.length - mid.length - right.length)
  return (
    '▀' +
    left +
    '▀'.repeat(Math.ceil(filler / 2)) +
    mid +
    '▀'.repeat(Math.floor(filler / 2)) +
    right
  )
}

const overlayCrosshair = (cells: Cell[][]) => {
  const cx = Math.floor(WIDTH / 2)
  const cy = Math.floor(VIEW_HEIGHT / 2)
  cells[cy][cx] = {ch: '+', kind: 'crosshair'}
  cells[cy][cx - 2] = {ch: '⋅', kind: 'crosshair'}
  cells[cy][cx + 2] = {ch: '⋅', kind: 'crosshair'}
  if (cy - 1 >= 0) cells[cy - 1][cx] = {ch: '⋅', kind: 'crosshair'}
  if (cy + 1 < VIEW_HEIGHT) cells[cy + 1][cx] = {ch: '⋅', kind: 'crosshair'}
}

const overlayMuzzleFlash = (cells: Cell[][]) => {
  const cx = Math.floor(WIDTH / 2)
  const y = VIEW_HEIGHT - 4
  const flashGlyphs = ' ▄▀█▀▄ '
  for (let i = 0; i < flashGlyphs.length; i++) {
    const x = cx - Math.floor(flashGlyphs.length / 2) + i
    if (x >= 0 && x < WIDTH && y >= 0 && y < VIEW_HEIGHT) {
      const ch = flashGlyphs[i]
      if (ch !== ' ') cells[y][x] = {ch, kind: 'flash'}
    }
  }
}

// Classic "rifle in front of camera" with slight walking bob.
const overlayGun = (cells: Cell[][], state: GameState) => {
  // bob based on total t when moving
  const moving = state.keys.size > 0
  const bob = moving ? Math.round(Math.sin(state.t * 10) * 1) : 0
  const offX = moving ? Math.round(Math.cos(state.t * 5) * 1) : 0

  const gun = [
    '          ║  ║          ',
    '        ╔═╩══╩═╗        ',
    '      ╔═╝ ░░░░ ╚═╗      ',
    '    ╔═╝  ▓▓▓▓▓▓  ╚═╗    ',
    '  ╔═╝   ██████████  ╚═╗ ',
  ]
  const startY = VIEW_HEIGHT - gun.length + bob
  const startX = Math.floor(WIDTH / 2 - gun[0].length / 2) + offX
  for (let j = 0; j < gun.length; j++) {
    for (let i = 0; i < gun[j].length; i++) {
      const ch = gun[j][i]
      const x = startX + i
      const y = startY + j
      if (x < 0 || x >= WIDTH || y < 0 || y >= VIEW_HEIGHT) continue
      if (ch === ' ') continue
      cells[y][x] = {ch, kind: 'flash'}
    }
  }
}

const overlayMessage = (cells: Cell[][], msg: string) => {
  if (!msg) return
  const y = 1
  const startX = Math.max(0, Math.floor((WIDTH - msg.length) / 2))
  for (let i = 0; i < msg.length; i++) {
    const x = startX + i
    if (x < 0 || x >= WIDTH) continue
    cells[y][x] = {ch: msg[i], kind: 'flash'}
  }
}

const overlayDamageTint = (cells: Cell[][]) => {
  for (let x = 0; x < WIDTH; x++) {
    cells[0][x] = {ch: '▓', kind: 'enemy'}
    cells[VIEW_HEIGHT - 1][x] = {ch: '▓', kind: 'enemy'}
  }
  for (let y = 0; y < VIEW_HEIGHT; y++) {
    cells[y][0] = {ch: '▓', kind: 'enemy'}
    cells[y][WIDTH - 1] = {ch: '▓', kind: 'enemy'}
  }
}

const titleArt: string[] = [
  '',
  '',
  '      ██████╗ ████████╗    ██████╗   ██████╗   ██████╗  ███╗   ███╗',
  '      ██╔══██╗╚══██╔══╝    ██╔══██╗ ██╔═══██╗ ██╔═══██╗ ████╗ ████║',
  '      ██████╔╝   ██║       ██║  ██║ ██║   ██║ ██║   ██║ ██╔████╔██║',
  '      ██╔═══╝    ██║       ██║  ██║ ██║   ██║ ██║   ██║ ██║╚██╔╝██║',
  '      ██║        ██║       ██████╔╝ ╚██████╔╝ ╚██████╔╝ ██║ ╚═╝ ██║',
  '      ╚═╝        ╚═╝       ╚═════╝   ╚═════╝   ╚═════╝  ╚═╝     ╚═╝',
  '',
  '       A FIRST-PERSON SHOOTER RENDERED INSIDE PORTABLE TEXT',
  '       ( every row you see below is a portable-text block )',
  '',
  '   CONTROLS',
  '     W / ↑   forward             Q / ←   turn left        SPACE  fire',
  '     S / ↓   backward            E / →   turn right       R      restart',
  '     A       strafe left',
  '     D       strafe right',
  '',
  '',
  '                     ──  PRESS ENTER TO START  ──',
  '',
]

const renderTitleScreen = (): Block[] => {
  blockCounter = 0
  const out: Block[] = []
  out.push(mkBlock([{text: '═'.repeat(WIDTH), kind: 'wall-ns'}]))
  for (const line of titleArt) {
    out.push(mkBlock([{text: pad(line, WIDTH), kind: 'floor'}]))
  }
  while (out.length < VIEW_HEIGHT + 1) {
    out.push(mkBlock([{text: pad('', WIDTH), kind: 'floor'}]))
  }
  out.push(mkBlock([{text: '═'.repeat(WIDTH), kind: 'wall-ns'}]))
  return out
}

// Build the classic DOOM-style dual-status bar: FACE | HP | AMMO | KILLS | MAP
const buildStatusRows = (state: GameState): Block[] => {
  const face = faceArt(state)
  const hpBar = bar(state.hp, PLAYER_MAX_HP, 18, '█', '░')
  const ammoBar = bar(state.ammo, MAX_AMMO, 12, '█', '·')

  const lines: string[] = []
  // 2 status rows (mirroring DOOM's thicc status bar)
  // row 0: [face][SCORE][HP][AMMO][KILLS]
  // row 1: [face][message row]
  const row0 = pad(
    ' ' + face[1] + '  SCORE ' + String(state.score).padStart(5, '0') +
      '   HP [' + hpBar + '] ' + String(state.hp).padStart(3, ' ') +
      '   AMMO [' + ammoBar + '] ' + String(state.ammo).padStart(2, ' ') +
      '   KILLS ' + state.kills + '/' + state.enemies.length,
    WIDTH,
  )
  const row1Msg = state.messageFramesLeft > 0 ? state.message : 'move with WASD / arrows · SPACE to fire · R to restart'
  const row1 = pad(' ' + face[2] + '  ' + row1Msg, WIDTH)
  lines.push(row0)
  lines.push(row1)
  return lines.map((t) => mkBlock([{text: t, kind: 'flash'}]))
}

const bar = (val: number, max: number, len: number, full: string, empty: string): string => {
  const fill = Math.max(0, Math.min(len, Math.floor((val / max) * len)))
  return full.repeat(fill) + empty.repeat(len - fill)
}

export const renderToBlocks = (state: GameState): Block[] => {
  blockCounter = 0

  if (state.phase === 'title') return renderTitleScreen()

  const {cells} = renderFrame(state)

  // overlay minimap in top-right
  const mm = buildMinimap(state)
  for (let j = 0; j < mm.length; j++) {
    const line = mm[j]
    const y = j + 1
    if (y >= VIEW_HEIGHT) break
    const startX = WIDTH - line.length - 2
    // minimap background
    cells[y][startX - 1] = {ch: '│', kind: 'wall-ns'}
    for (let i = 0; i < line.length; i++) {
      const x = startX + i
      if (x < 0 || x >= WIDTH) continue
      const ch = line[i]
      let kind: Cell['kind'] = 'floor'
      if (ch === '✕') kind = 'enemy'
      else if (ch === '█') kind = 'wall-ns'
      else if (ch === '▲' || ch === '▼' || ch === '◀' || ch === '▶') kind = 'crosshair'
      cells[y][x] = {ch: ch === ' ' ? '·' : ch, kind}
    }
  }

  overlayGun(cells, state)
  overlayCrosshair(cells)
  if (state.muzzleFlash > 0) overlayMuzzleFlash(cells)
  if (state.damageFlash > 0) overlayDamageTint(cells)
  if (state.messageFramesLeft > 0 || state.phase !== 'playing') overlayMessage(cells, state.message)

  const blocks: Block[] = []
  blocks.push(mkBlock([{text: buildTitleBar(state), kind: 'wall-ns'}]))
  for (const row of cells) blocks.push(mkBlock(runsFromRow(row)))
  for (const b of buildStatusRows(state)) blocks.push(b)
  return blocks
}
