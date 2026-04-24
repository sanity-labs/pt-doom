# PT-DOOM

**A first-person shooter rendered inside `@portabletext/editor`.**

Every row on the game screen is a Portable Text block. Input is captured by the editor's [Behaviors API](https://www.portabletext.org/editor/guides/create-behavior/) — `WASD`, arrow keys and space are all intercepted by `defineBehavior` rules that mutate a small game state ref. A `requestAnimationFrame` loop raycasts the 2D map into ASCII and pushes the new rows into the editor via `editor.send({type: 'update value', value})`.

No canvas. No WebGL. Just Portable Text.

[▶ Play at pt-doom.sanity.dev](https://pt-doom.sanity.dev)

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | forward |
| `S` / `↓` | backward |
| `A` / `D` | strafe |
| `Q` / `E` / `←` / `→` | turn |
| `SPACE` | fire |
| `R` | restart |

## How it's wired

```
keyboard.keydown ──► defineBehavior guard ──► effect() ──► mutate state ref
                                                              │
                       ┌──────────────────────────────────────┘
                       ▼
         requestAnimationFrame → step(state) → renderToBlocks(state)
                                                      │
                                                      ▼
                              editor.send({type:'update value', value})
                                                      │
                                                      ▼
                                          <PortableTextEditable /> paints
```

- **`src/game/behaviors.ts`** — three `defineBehavior` rules. `keyboard.keydown` matches game keys, runs `effect(() => mutate(state))` and returns no other action, so the keys are swallowed before they can insert text. `keyboard.keyup` clears held keys. `insert.text` is a belt-and-braces guard against stray character input.
- **`src/game/raycast.ts`** — classic DDA raycaster using the 70-char Paul Bourke brightness ramp (`.'^",:;Il!i...@$`), fisheye correction, per-column zBuffer, and chunky red demon sprites at three LODs.
- **`src/game/render.ts`** — game state → array of Portable Text blocks. Each row is split into runs by cell kind so decorator marks (`walln`, `walle`, `floor`, `ceil`, `enemy`, `cross`, `flash`) can color them.
- **`src/App.tsx`** — `<EditorProvider>` + `<PortableTextEditable>` + `<BehaviorPlugin>`.

## Hack it live

Open devtools and poke the game state ref:

```js
__ptfps.hp = 999
__ptfps.ammo = 9999
__ptfps.paused = true
__ptfps.enemies.forEach(e => (e.dead = true))
```

## Run locally

```
npm install
npm run dev
```

## License

MIT — see [LICENSE](./LICENSE).
