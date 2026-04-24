import {useEffect, useMemo, useRef} from 'react'
import {
  EditorProvider,
  PortableTextEditable,
  defineSchema,
  useEditor,
} from '@portabletext/editor'
import {BehaviorPlugin} from '@portabletext/editor/plugins'
import {makeGameBehaviors} from './game/behaviors'
import {makeInitialState, type GameState} from './game/world'
import {step} from './game/step'
import {renderToBlocks} from './game/render'

const schemaDefinition = defineSchema({
  decorators: [
    {name: 'walln'},
    {name: 'walle'},
    {name: 'floor'},
    {name: 'ceil'},
    {name: 'enemy'},
    {name: 'cross'},
    {name: 'flash'},
    {name: 'pickup'},
    {name: 'medkit'},
  ],
  styles: [{name: 'normal'}],
  annotations: [],
  lists: [],
  inlineObjects: [],
  blockObjects: [],
})

// Inner component: has access to editor via useEditor()
function GameBridge({stateRef}: {stateRef: {current: GameState}}) {
  const editor = useEditor()

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      step(stateRef.current, dt)
      const blocks = renderToBlocks(stateRef.current)
      editor.send({type: 'update value', value: blocks})
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [editor, stateRef])

  // Keep focus inside the editor so it receives keyboard events.
  useEffect(() => {
    const grab = () => editor.send({type: 'focus'})
    const t = setTimeout(grab, 60)
    window.addEventListener('click', grab)
    window.addEventListener('focus', grab)
    return () => {
      clearTimeout(t)
      window.removeEventListener('click', grab)
      window.removeEventListener('focus', grab)
    }
  }, [editor])

  return null
}

export function App() {
  const stateRef = useRef<GameState>(makeInitialState())
  // Expose the live game state on `window.__ptfps` so you can hack on it
  // from the devtools console — e.g. `__ptfps.hp = 1` or `__ptfps.ammo = 999`.
  ;(window as unknown as {__ptfps?: GameState}).__ptfps = stateRef.current
  const behaviors = useMemo(() => makeGameBehaviors(stateRef), [])
  const initialValue = useMemo(() => renderToBlocks(stateRef.current), [])

  return (
    <div className="screen">
      <div className="crt-glow">
        <EditorProvider
          initialConfig={{
            schemaDefinition,
            initialValue,
          }}
        >
          <BehaviorPlugin behaviors={behaviors} />
          <GameBridge stateRef={stateRef} />
          <div className="terminal">
            <PortableTextEditable
              className="pte"
              spellCheck={false}
              renderDecorator={(props) => (
                <span className={`d-${props.value}`}>{props.children}</span>
              )}
              renderBlock={(props) => <div className="row">{props.children}</div>}
              renderChild={(props) => <>{props.children}</>}
            />
          </div>
        </EditorProvider>
      </div>
      <footer className="explainer">
        <strong>PT-DOOM —</strong> a first-person shooter rendered inside a{' '}
        <code>@portabletext/editor</code> v6.6 instance. Every row of the game
        screen is a Portable Text block. WASD / arrows / space are captured by{' '}
        <code>defineBehavior</code> rules that call <code>effect()</code> to
        mutate a <code>useRef</code> game state — no other action is returned,
        so the keys are swallowed before they can insert text. A{' '}
        <code>requestAnimationFrame</code> loop raycasts the 2D grid into ASCII
        using the classic Bourke / doom-ascii brightness ramp, then pushes the
        new rows into the editor via{' '}
        <code>editor.send(&#123;type:&nbsp;'update&nbsp;value',&nbsp;value&#125;)</code>.
        No canvas. No WebGL. Just Portable Text. Hack the game live in devtools
        with <code>window.__ptfps</code>.
      </footer>
    </div>
  )
}
