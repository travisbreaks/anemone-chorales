# Anemone Chorales

Real-time 3D audio visualization engine. A bioluminescent sea anemone that dances to music, driven by frequency analysis, custom GLSL shaders, and a depth-based energy model.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://travisbreaks.org/share/parse-and-garner/)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![Music: CC BY-NC-ND 4.0](https://img.shields.io/badge/music-CC_BY--NC--ND_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-nd/4.0/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-GLSL-black)](https://threejs.org)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-FFT-purple)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

![anemone-chorales](https://assets.travisbreaks.com/github/anemone-chorales.png)

## Tech Stack

React 19, Three.js, React Three Fiber, GLSL, Web Audio API, TypeScript, Vite

## Features

- **Audio-reactive creature**: FFT frequency bands (bass/mids/treble) drive tentacle sway, bulge, curl, and flutter through custom vertex/fragment shaders
- **Transient detection**: frame-over-frame delta analysis triggers kick-drum flare effects with fast-decay punch
- **3 switchable biomes**: BIOLUM (violet/cyan), ABYSS (navy/cold blue), GRAVITAS (black/gold), each with a 3-stop energy-driven color spectrum
- **Depth system**: 7 nautical zones from SURFACE to ABYSSAL, driven by a leaky-integrator heat model that gates animation phases and visual complexity
- **Shader-only glow**: no postprocessing bloom (avoids R3F flicker); all glow achieved via fresnel rim lighting, per-fragment texture, and transient flash

## How It Works

Audio analysis runs at 60fps outside React via `requestAnimationFrame`. Smoothed frequency data flows to GLSL uniforms through refs, keeping the render loop decoupled from React's batching. A single "heat" scalar (0-1) accumulates energy over time and gates three animation phases: dormant, reactive, and overdrive.

## Development

```bash
npm install
npm run dev    # Vite dev server
npm run build  # Production build
```

---

Part of the [travisBREAKS](https://travisbreaks.org) portfolio.
