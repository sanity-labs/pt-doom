import {defineBehavior, effect} from '@portabletext/editor/behaviors'
import type {GameState} from './world'
import {fireShot, resetGame} from './step'

/**
 * All input for PT-DOOM is driven by the Portable Text Editor's Behavior API.
 *
 * Every keystroke lands in the editor as a `keyboard.keydown` event. We match
 * game-relevant keys with a `guard`, run an `effect` to update game state,
 * and intentionally return *no other* action — that swallows the key so the
 * editor doesn't insert text, move the caret, or do anything default.
 *
 * It's a wild use of Behaviors: the editor becomes a game pad.
 */

const GAME_KEYS = new Set([
  'w', 'a', 's', 'd',
  'W', 'A', 'S', 'D',
  'q', 'e', 'Q', 'E',
  'r', 'R',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ' ', 'Enter',
])

const normalize = (k: string) => {
  // treat uppercase (shift held) as lowercase for movement keys
  if (k.length === 1 && k >= 'A' && k <= 'Z') return k.toLowerCase()
  return k
}

export const makeGameBehaviors = (stateRef: {current: GameState}) => {
  const onKeyDown = defineBehavior({
    on: 'keyboard.keydown',
    guard: ({event}) => GAME_KEYS.has(event.originEvent.key),
    actions: [
      ({event}) => [
        effect(() => {
          const state = stateRef.current
          const key = normalize(event.originEvent.key)

          // title screen → press Enter to start
          if (state.phase === 'title') {
            if (key === 'Enter') {
              state.phase = 'playing'
              state.startMs = performance.now()
              state.keys.clear() // drop any stale state from title input
              state.message = 'KILL THEM ALL.'
              state.messageFramesLeft = 60
            }
            return
          }

          // death/win → press R to restart
          if (state.phase === 'dead' || state.phase === 'win') {
            if (key === 'r') resetGame(state)
            return
          }

          // playing
          if (key === ' ') {
            fireShot(state)
            return
          }
          if (key === 'r') {
            resetGame(state)
            return
          }

          // movement keys: record timestamp
          state.keys.set(key, performance.now())
        }),
      ],
    ],
  })

  const onKeyUp = defineBehavior({
    on: 'keyboard.keyup',
    guard: ({event}) => GAME_KEYS.has(event.originEvent.key),
    actions: [
      ({event}) => [
        effect(() => {
          const state = stateRef.current
          const key = normalize(event.originEvent.key)
          state.keys.delete(key)
        }),
      ],
    ],
  })

  // Belt-and-braces: also swallow raw text inserts triggered by any stray
  // `insert.text` event (e.g. WASD that slipped past as compositional input).
  // We simply return no actions — matching the event, guarded on the game
  // keys, and producing no effect and no forward, which drops it.
  const blockTextInput = defineBehavior({
    on: 'insert.text',
    guard: ({event}) => {
      if (stateRef.current.phase === 'title') return true
      if (event.text.length !== 1) return false
      const k = event.text
      return GAME_KEYS.has(k) || GAME_KEYS.has(k.toLowerCase()) || k === ' '
    },
    actions: [() => [effect(() => {})]],
  })

  return [onKeyDown, onKeyUp, blockTextInput]
}
