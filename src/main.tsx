import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

// No StrictMode — it double-mounts components in dev, which destroys
// and recreates WebGL contexts/render targets causing flicker with R3F + EffectComposer
createRoot(document.getElementById('root')!).render(<App />)
