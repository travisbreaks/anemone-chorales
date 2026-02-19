# Anemone Chorales — Architecture

R3F audio visualizer for Travis's music. Real Web Audio API analysis drives a shader-based sea anemone through 3 biomes.

**Live**: travisbreaks.org/research/anemone-chorales/

## Stack
- **React 19 + R3F** (Three.js r182) + Vite 7
- **No postprocessing** — bloom causes flicker in R3F. All glow is shader-based (overdrive tip color + fresnel).
- Workspace: `anemone-chorales` in CODE monorepo
- Deploy: subdirectory of travisbreaks-site (same pattern as Kimi)

## File Map

```
src/
├── main.tsx                    # Entry point (StrictMode → App)
├── App.tsx                     # Canvas + audio rAF loop + state + wiring
├── types/index.ts              # BiomeId, Biome, AnemoneConfig, AudioAnalysis
├── biomes/index.ts             # 3 biomes: Biolum, Abyss, Gravitas (base/body/tip hex)
├── audio/
│   └── AudioAnalyzer.ts        # Web Audio API: AnalyserNode → FFT → bass/mid/treble + transient detector
├── shaders/
│   └── anemoneShader.ts        # Geometry builder + vertex/fragment shaders + material + uniforms
├── styles/
│   └── index.css               # Gravitas aesthetic, kinetic typography animations
└── components/
    ├── AnemoneScene.tsx         # Scene root: intensity + depth state machine + group physics + camera
    ├── OceanBackground.tsx      # Gradient sky dome with god rays, bokeh, edge taper
    ├── Particles.tsx            # Floating ocean particles
    ├── ReefGround.tsx           # Coral-textured reef floor
    ├── Caustics.tsx             # Caustic light plane
    ├── OverlayControls.tsx      # Floating UI: biome selector, sliders, kinetic title, album art, depth chart
    └── LoadingScreen.tsx        # Glass card loading overlay with progress bar
```

## Core Systems

### Audio Pipeline
```
App.tsx rAF → AudioAnalyzer.tick() → raw bass/mid/treble + transient
  → smoothedRef (lerp: rise 0.12, decay 0.04) → analysisRef
  → transient passes through unsmoothed (already decay-managed)
  → AnemoneScene useFrame reads analysisRef
```

FFT bin mapping (fftSize=1024, 44.1kHz → ~43Hz/bin):
- Bass: bins 1-5 (43-215Hz) — kick drum fundamentals
- Mids: bins 5-40 (215-1720Hz) — warmth, melodic body
- Treble: bins 40-120 (1720-5160Hz) — presence, hi-hats, sparkle

### Transient Detector (AudioAnalyzer.ts)
- Frame-over-frame bass delta — big jumps = kick hits, drops
- Threshold: 0.08, spike scaled by `(delta - 0.08) * 4.0`, capped at 1.0
- Fast decay: `*= 0.85` per frame (snappy, not lingering)
- Drives: tip flare, white-hot core, rim intensity, opacity punch

### Shader Uniforms (anemoneShader.ts)
| Uniform | Source | Purpose |
|---------|--------|---------|
| uTime | clock | Base animation |
| uAudioLow/Mid/High | analysisRef | Frequency bands |
| uIntensity | intensityRef | Perceived loudness (fast rise, slow decay) |
| uHeat | heatRef | Leaky integrator — creature's accumulated energy |
| uTransient | analysisRef | Kick/drop detection — brief bright flare |
| uFlowSpeed, uReactivity | config sliders | User controls |
| uColorBase/Body/Tip | biome | 3-stop color spectrum |

### Energy-Driven Color Model (fragment shader)
- `colorDrive = energy * mix(0.4, 1.0, tipSensitivity) + heat * 0.15`
- Silent = base color (dark), loud = tip color (bright)
- Tips shift first (more sensitive), base follows
- Per-fragment procedural texture hash — increases with heat (2% surface → 15% abyssal)
- Transient flash: tip flare + white-hot core on very tips

### Depth System (3-mode state machine)
Modes: `normal` | `ascending` | `paused` — shared via `depthModeRef`

**Normal**: energy-driven descent/ascent
- Descends: `+0.0005 * excess * (1 + depth * 0.2)` when energy > 0.12
- Ascends: `-0.0004` when quiet
- ~60-90s sustained music to reach Abyssal

**Ascending**: smooth rise to surface (`-0.002/frame`, ~8s from abyssal)
**Paused**: hold at surface for 2s, then resume normal

- ASCEND button: grayed out until Open Water (heat >= 0.25)
- Button state updated via rAF (direct DOM manipulation, not React re-render)
- 7 nautical zones: SURFACE → SHALLOWS → OPEN WATER → TWILIGHT ZONE → MIDNIGHT ZONE → THE DEEP → ABYSSAL
- Canvas-based depth chart: samples every 30 frames (~500ms), 80 data points = ~40s visible history

### Group Physics (AnemoneScene.tsx)
- Heat-gated bass surge (shoveGate) and energy shake (shakeGate)
- Group moves, not camera — keeps ocean background stable
- Mouse parallax on camera only

## Biome Palettes
| Biome | Base (silent) | Body (mid) | Tip (loud) |
|-------|--------------|-----------|-----------|
| Biolum | `#1E0836` | `#8B3A9F` | `#4DE8D4` |
| Abyss | `#010408` | `#082B5A` | `#3B7DD8` |
| Gravitas | `#0A0800` | `#8B6914` | `#C9A227` |

## Public Assets
| File | Size | Purpose |
|------|------|---------|
| album-art.png | 1.3MB | Album cover + fullscreen overlay |
| anemone-chorales-vol1.mp3 | 18.6MB | Audio source |
| coral-reef.jpg | 165KB | ReefGround texture |
| coral-texture.png | 298KB | Base mesh texture |

## Dev
```bash
cd anemone-chorales && npx vite --host --port 5173
```

## Gotchas
- **Shader HMR**: Vite HMR won't recompile ShaderMaterial. Kill server → `rm -rf node_modules/.vite` → restart → Cmd+Shift+R
- **No bloom**: Every postprocessing bloom approach flickers in R3F. Shader-based only.
- **Mobile audio**: Phone sleep suspends AudioContext. Listen for native `pause`/`play` events on HTMLAudioElement.
- **Mobile preload**: Mobile browsers don't preload audio without user gesture. `AudioAnalyzer.init()` has 3s timeout fallback so UI doesn't get stuck on "LOADING...".
- **Loading screen**: Deferred Canvas mounting until transition phase prevents WebGL punch-through. Glass card layout matches controls-panel aesthetic.
