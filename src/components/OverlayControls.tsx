import { useEffect, useRef, useState } from 'react'
import { BIOMES } from '@/biomes'
import type { AnemoneConfig, AudioAnalysis, BiomeId } from '@/types'

interface Props {
  config: AnemoneConfig
  isPlaying: boolean
  audioReady: boolean
  analysisRef: React.RefObject<AudioAnalysis>
  heatRef: React.MutableRefObject<number>
  depthModeRef: React.MutableRefObject<{ mode: 'normal' | 'ascending' | 'paused'; pauseUntil: number }>
  onConfigChange: (update: Partial<AnemoneConfig>) => void
  onToggleAudio: () => void
}

const BIOME_IDS: BiomeId[] = ['biolum', 'abyss', 'gravitas']

export default function OverlayControls({
  config,
  isPlaying,
  audioReady,
  analysisRef,
  heatRef,
  depthModeRef,
  onConfigChange,
  onToggleAudio,
}: Props) {
  const [artExpanded, setArtExpanded] = useState(false)
  const [hasClicked, setHasClicked] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const depthCanvasRef = useRef<HTMLCanvasElement>(null)
  const depthLabelRef = useRef<HTMLSpanElement>(null)
  const depthHistory = useRef<number[]>(new Array(80).fill(0)) // 80 samples, ~40s of history
  const sampleCounter = useRef(0) // throttle: sample every 30 frames (~0.5s)
  const resetBtnRef = useRef<HTMLButtonElement>(null)

  // Kinetic typography — animate letter-spacing + glow directly on DOM at 60fps
  useEffect(() => {
    let animId: number
    // Smoothed values to avoid jarring jumps
    const smoothed = { spacing: 4, glow: 0 }

    const tick = () => {
      const el = titleRef.current
      const analysis = analysisRef.current
      if (el && analysis) {
        // Mid frequencies drive letter expansion (melodic content = breathing)
        const targetSpacing = 4 + analysis.midLevel * 4
        // Bass drives glow intensity
        const targetGlow = analysis.bassLevel

        // Smooth: rise fast (0.12), decay slow (0.04)
        smoothed.spacing += (targetSpacing - smoothed.spacing) * (targetSpacing > smoothed.spacing ? 0.12 : 0.04)
        smoothed.glow += (targetGlow - smoothed.glow) * (targetGlow > smoothed.glow ? 0.15 : 0.03)

        el.style.letterSpacing = `${smoothed.spacing}px`

        // Cyan glow on bass hits, magenta on decay
        const glowOpacity = smoothed.glow * 0.4
        const glowSpread = 8 + smoothed.glow * 12
        el.style.textShadow = `0 0 ${glowSpread}px rgba(107, 232, 217, ${glowOpacity}), 0 0 ${glowSpread * 2}px rgba(196, 91, 160, ${glowOpacity * 0.5})`
      }
      // Depth monitor — stock-chart style, samples every ~0.5s for slow scroll
      const canvas = depthCanvasRef.current
      const label = depthLabelRef.current
      if (canvas && label) {
        const h = heatRef.current
        const history = depthHistory.current

        // Throttle: only push a new sample every 30 frames (~500ms at 60fps)
        sampleCounter.current++
        if (sampleCounter.current >= 30) {
          sampleCounter.current = 0
          history.push(h)
          if (history.length > 80) history.shift()
        }

        // Update label — nautical depth zones
        if (h < 0.12) {
          label.textContent = 'SURFACE'
          label.style.color = 'rgba(107, 232, 217, 0.5)'
        } else if (h < 0.25) {
          label.textContent = 'SHALLOWS'
          label.style.color = 'rgba(107, 232, 217, 0.6)'
        } else if (h < 0.4) {
          label.textContent = 'OPEN WATER'
          label.style.color = 'rgba(140, 180, 200, 0.65)'
        } else if (h < 0.55) {
          label.textContent = 'TWILIGHT ZONE'
          label.style.color = 'rgba(160, 120, 180, 0.7)'
        } else if (h < 0.7) {
          label.textContent = 'MIDNIGHT ZONE'
          label.style.color = 'rgba(196, 91, 160, 0.75)'
        } else if (h < 0.85) {
          label.textContent = 'THE DEEP'
          label.style.color = 'rgba(220, 180, 220, 0.8)'
        } else {
          label.textContent = 'ABYSSAL'
          label.style.color = 'rgba(255, 255, 255, 0.9)'
        }

        // Draw the chart
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const w = canvas.width
          const ht = canvas.height
          ctx.clearRect(0, 0, w, ht)

          // Zone backgrounds (subtle gradient — lighter at top, darker at bottom)
          ctx.fillStyle = 'rgba(107, 232, 217, 0.03)'
          ctx.fillRect(0, 0, w, ht * 0.25)
          ctx.fillStyle = 'rgba(140, 180, 200, 0.025)'
          ctx.fillRect(0, ht * 0.25, w, ht * 0.3)
          ctx.fillStyle = 'rgba(196, 91, 160, 0.025)'
          ctx.fillRect(0, ht * 0.55, w, ht * 0.3)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
          ctx.fillRect(0, ht * 0.85, w, ht * 0.15)

          // Zone dividers at key thresholds
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
          ctx.lineWidth = 0.5
          ctx.setLineDash([2, 3])
          ctx.beginPath()
          ctx.moveTo(0, ht * 0.25)
          ctx.lineTo(w, ht * 0.25)
          ctx.moveTo(0, ht * 0.55)
          ctx.lineTo(w, ht * 0.55)
          ctx.moveTo(0, ht * 0.85)
          ctx.lineTo(w, ht * 0.85)
          ctx.stroke()
          ctx.setLineDash([])

          // Line chart — depth value scrolls left to right
          if (history.length > 1) {
            ctx.beginPath()
            const step = w / (history.length - 1)
            for (let i = 0; i < history.length; i++) {
              const x = i * step
              const y = history[i] * ht
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
            // Gradient stroke based on current depth
            const grad = ctx.createLinearGradient(0, 0, 0, ht)
            grad.addColorStop(0, 'rgba(107, 232, 217, 0.6)')
            grad.addColorStop(0.5, 'rgba(196, 91, 160, 0.7)')
            grad.addColorStop(1, 'rgba(255, 255, 255, 0.8)')
            ctx.strokeStyle = grad
            ctx.lineWidth = 1.5
            ctx.stroke()

            // Fill below the line (subtle)
            ctx.lineTo(w, ht)
            ctx.lineTo(0, ht)
            ctx.closePath()
            const fillGrad = ctx.createLinearGradient(0, 0, 0, ht)
            fillGrad.addColorStop(0, 'rgba(107, 232, 217, 0.05)')
            fillGrad.addColorStop(0.5, 'rgba(196, 91, 160, 0.08)')
            fillGrad.addColorStop(1, 'rgba(255, 255, 255, 0.06)')
            ctx.fillStyle = fillGrad
            ctx.fill()

            // Current value dot
            const lastX = (history.length - 1) * step
            const lastY = history[history.length - 1] * ht
            ctx.beginPath()
            ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2)
            ctx.fillStyle =
              h < 0.3 ? 'rgba(107, 232, 217, 0.8)' : h < 0.7 ? 'rgba(196, 91, 160, 0.9)' : 'rgba(255, 255, 255, 0.9)'
            ctx.fill()
          }
        }
      }

      // Update ascend button text + disabled state (ref-driven, no React re-render)
      const btn = resetBtnRef.current
      if (btn) {
        const dm = depthModeRef.current
        if (dm.mode === 'ascending') {
          btn.textContent = 'ASCENDING...'
          btn.style.opacity = '0.5'
          btn.style.pointerEvents = 'none'
        } else if (dm.mode === 'paused') {
          btn.textContent = 'SURFACE'
          btn.style.opacity = '0.5'
          btn.style.pointerEvents = 'none'
        } else {
          btn.textContent = 'ASCEND'
          const canAscend = heatRef.current >= 0.25
          btn.style.opacity = canAscend ? '1' : '0.3'
          btn.style.pointerEvents = canAscend ? 'auto' : 'none'
        }
      }

      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [analysisRef, heatRef, depthModeRef])

  const handleArtClick = () => {
    setArtExpanded(true)
    setHasClicked(true)
  }

  return (
    <div className="overlay">
      {/* Fullscreen album art overlay */}
      {artExpanded && (
        <div className="art-overlay" onClick={() => setArtExpanded(false)}>
          <img src="./album-art.png" alt="Anemone Chorales Vol. 1" className="art-fullscreen" />
        </div>
      )}

      {/* Controls panel — centered bottom */}
      <div className="controls-panel">
        {/* Title row — clickable to expand album art */}
        <div className="title-row" onClick={handleArtClick}>
          <div className="album-art-wrap">
            <img src="./album-art.png" alt="Anemone Chorales Vol. 1" className="album-art" />
            {!hasClicked && (
              <svg className="tap-hint" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                {/* Standard cursor pointer / hand with index finger */}
                <path d="M10.5 2a1.5 1.5 0 0 1 1.5 1.5v8.75l3.44-1.38a1.5 1.5 0 0 1 1.94.88l.12.32a1.5 1.5 0 0 1-.56 1.7L12.5 17.5l-.5 2.5h-5l-1-3L4 14.5a1.5 1.5 0 0 1-.5-1.12V11.5A1.5 1.5 0 0 1 5 10h.5l1-.5 2.5-1V3.5A1.5 1.5 0 0 1 10.5 2Z" />
              </svg>
            )}
          </div>
          <h1 ref={titleRef}>
            <span className="title-line">Anemone</span>
            <span className="title-line title-line--offset">Chorales</span>
          </h1>
        </div>

        <div className="panel-divider" />

        {/* Play/Pause — inverts when active */}
        <button
          className={`play-btn ${isPlaying ? 'play-btn--active' : ''}`}
          onClick={onToggleAudio}
          disabled={!audioReady}
        >
          {!audioReady ? 'LOADING...' : isPlaying ? 'PAUSE' : 'PLAY'}
        </button>

        <div className="panel-divider" />

        {/* Biome selector */}
        <div className="biome-row">
          {BIOME_IDS.map((id) => (
            <button
              key={id}
              className="biome-btn"
              data-active={config.biome === id}
              onClick={() => onConfigChange({ biome: id })}
            >
              {BIOMES[id].name}
            </button>
          ))}
        </div>

        {/* Density: 8-64 (desktop only) */}
        <div className="control-group desktop-only">
          <div className="control-label">
            <span>Density</span>
            <span className="val">{config.density}</span>
          </div>
          <input
            type="range"
            min={8}
            max={32}
            step={4}
            value={config.density}
            onChange={(e) => onConfigChange({ density: Number(e.target.value) })}
          />
        </div>

        {/* Flow Speed: 0.3-3.0x (desktop only) */}
        <div className="control-group desktop-only">
          <div className="control-label">
            <span>Flow Speed</span>
            <span className="val">{config.flowSpeed.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min={0.3}
            max={2.0}
            step={0.1}
            value={config.flowSpeed}
            onChange={(e) => onConfigChange({ flowSpeed: Number(e.target.value) })}
          />
        </div>

        {/* Reactivity: 0-100% */}
        <div className="control-group">
          <div className="control-label">
            <span>Reactivity</span>
            <span className="val">{Math.round(config.reactivity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.reactivity}
            onChange={(e) => onConfigChange({ reactivity: Number(e.target.value) })}
          />
        </div>

        <div className="panel-divider" />

        {/* Depth monitor — scrolling intensity chart */}
        <div className="depth-row">
          <div className="depth-header">
            <span className="depth-title">DEPTH</span>
            <span className="depth-label" ref={depthLabelRef}>
              SURFACE
            </span>
          </div>
          <div className="depth-chart-wrap">
            <canvas ref={depthCanvasRef} width={280} height={48} className="depth-canvas" />
          </div>
          <button
            ref={resetBtnRef}
            className="depth-reset"
            onClick={() => {
              if (depthModeRef.current.mode !== 'normal' || heatRef.current < 0.25) return
              depthModeRef.current.mode = 'ascending'
              // Flash: snap ON instantly, ease OFF smoothly
              const btn = resetBtnRef.current
              if (btn) {
                btn.style.transition = 'none'
                btn.classList.add('depth-reset--flash')
                btn.offsetHeight
                btn.style.transition = ''
                setTimeout(() => btn.classList.remove('depth-reset--flash'), 150)
              }
            }}
          >
            ASCEND
          </button>
        </div>
      </div>
    </div>
  )
}
