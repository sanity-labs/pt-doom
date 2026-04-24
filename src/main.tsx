import ReactDOM from 'react-dom/client'
import {App} from './App'
import './styles.css'

// Note: intentionally NOT wrapping in <StrictMode>. The rAF game loop plus
// the editor's imperative `update value` sends don't tolerate double-mount
// well in dev — StrictMode mounts the tree twice and we end up with two
// loops racing to update the same editor. In production builds StrictMode
// is a no-op anyway.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
