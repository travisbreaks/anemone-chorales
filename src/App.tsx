import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { AudioAnalyzer } from '@/audio/AudioAnalyzer'
import AnemoneScene from '@/components/AnemoneScene'
import LoadingScreen from '@/components/LoadingScreen'
import OverlayControls from '@/components/OverlayControls'
import type { AnemoneConfig, AudioAnalysis } from '@/types'
import { DEFAULT_CONFIG } from '@/types'

const emptyAnalysis: AudioAnalysis = {
  frequencyData: new Uint8Array(64),
  bassLevel: 0,
  midLevel: 0,
  trebleLevel: 0,
  transientLevel: 0,
  overallEnergy: 0,
  bpm: 120,
}

export default function App() {
  const [config, setConfig] = useState<AnemoneConfig>(DEFAULT_CONFIG)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [showLoading, setShowLoading] = useState(true)
  // Phase: 'loading' → 'ready' (click to enter) → 'transition' (fade) → 'done'
  const [loadPhase, setLoadPhase] = useState<'loading' | 'ready' | 'transition' | 'done'>('loading')

  // Animated display progress (0-1) — smoothly lerps, never jumps
  const [displayProgress, setDisplayProgress] = useState(0)
  const realProgressRef = useRef(0) // actual buffering progress
  const audioReadyRef = useRef(false)

  const analysisRef = useRef<AudioAnalysis>(emptyAnalysis)
  const mouseRef = useRef({ x: 0, y: 0 })
  const heatRef = useRef(0)
  // Depth mode: 'normal' | 'ascending' | 'paused' — shared between AnemoneScene and OverlayControls
  const depthModeRef = useRef<{ mode: 'normal' | 'ascending' | 'paused'; pauseUntil: number }>({
    mode: 'normal',
    pauseUntil: 0,
  })

  const analyzerRef = useRef<AudioAnalyzer | null>(null)
  const lastTimeRef = useRef(0)
  const smoothedRef = useRef({ bass: 0, mid: 0, treble: 0 })

  // Initialize audio analyzer
  useEffect(() => {
    const analyzer = new AudioAnalyzer()
    analyzerRef.current = analyzer
    analyzer.onStateChange = (playing) => setIsPlaying(playing)
    analyzer.onProgress = (p) => {
      realProgressRef.current = p
    }

    analyzer.init('./anemone-chorales-vol1.mp3').then(() => {
      audioReadyRef.current = true
      setAudioReady(true)
    })
    return () => analyzer.dispose()
  }, [])

  // Animate display progress — pure 3.5s easeInOut animation, ignores real load speed
  useEffect(() => {
    if (loadPhase !== 'loading') return
    const startTime = performance.now()
    const DURATION = 3500 // ms — always takes this long regardless of cache
    let animId: number

    const tick = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(elapsed / DURATION, 1)
      // easeInOutCubic — slow start, fast middle, slow end
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

      setDisplayProgress(eased)

      // Finish when animation is done AND (audio is ready OR timeout exceeded)
      // Mobile browsers don't preload audio — can't block forever
      if (t >= 1 && (audioReadyRef.current || elapsed > DURATION + 3000)) {
        setLoadPhase('ready')
        return
      }

      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [loadPhase])

  // Main tick loop — writes to ref, NOT state
  useEffect(() => {
    let animId: number

    const tick = (timestamp: number) => {
      const time = timestamp / 1000
      const delta = time - lastTimeRef.current
      lastTimeRef.current = time

      if (delta > 0 && delta < 0.5) {
        const analyzer = analyzerRef.current
        const smoothed = smoothedRef.current

        let targetBass = 0
        let targetMid = 0
        let targetTreble = 0

        if (analyzer && analyzer.isPlaying) {
          analyzer.tick()
          const raw = analyzer.getAnalysis()
          targetBass = raw.bassLevel
          targetMid = raw.midLevel
          targetTreble = raw.trebleLevel
        }

        const riseRate = 0.12
        const decayRate = 0.04

        smoothed.bass += (targetBass - smoothed.bass) * (targetBass > smoothed.bass ? riseRate : decayRate)
        smoothed.mid += (targetMid - smoothed.mid) * (targetMid > smoothed.mid ? riseRate : decayRate)
        smoothed.treble += (targetTreble - smoothed.treble) * (targetTreble > smoothed.treble ? riseRate : decayRate)

        if (smoothed.bass < 0.001) smoothed.bass = 0
        if (smoothed.mid < 0.001) smoothed.mid = 0
        if (smoothed.treble < 0.001) smoothed.treble = 0

        // Transient passes through unsmoothed — it's already decay-managed in AudioAnalyzer
        const rawAnalysis = analyzer?.isPlaying ? analyzer.getAnalysis() : null

        analysisRef.current = {
          frequencyData: rawAnalysis?.frequencyData ?? new Uint8Array(64),
          bassLevel: smoothed.bass,
          midLevel: smoothed.mid,
          trebleLevel: smoothed.treble,
          transientLevel: rawAnalysis?.transientLevel ?? 0,
          overallEnergy: smoothed.bass * 0.4 + smoothed.mid * 0.35 + smoothed.treble * 0.25,
          bpm: 120,
        }
      }

      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [])

  // Mouse + touch tracking
  useEffect(() => {
    const updateMouse = (clientX: number, clientY: number) => {
      mouseRef.current.x = (clientX / window.innerWidth) * 2 - 1
      mouseRef.current.y = -(clientY / window.innerHeight) * 2 + 1
    }
    const handleMouseMove = (e: MouseEvent) => updateMouse(e.clientX, e.clientY)
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateMouse(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  const handleConfigChange = useCallback((update: Partial<AnemoneConfig>) => {
    setConfig((prev) => ({ ...prev, ...update }))
  }, [])

  const handleToggleAudio = useCallback(async () => {
    const analyzer = analyzerRef.current
    if (!analyzer) return
    await analyzer.toggle()
    setIsPlaying(analyzer.isPlaying)
  }, [])

  // "Click to enter" → fade out → remove
  const handleEnter = useCallback(() => {
    setLoadPhase('transition')
    setTimeout(() => {
      setLoadPhase('done')
      setShowLoading(false)
    }, 800)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020810' }}>
      {showLoading && <LoadingScreen progress={displayProgress} phase={loadPhase} onEnter={handleEnter} />}

      {/* Don't mount Canvas until loading screen starts fading — prevents WebGL color-space mismatch lines */}
      {(loadPhase === 'transition' || loadPhase === 'done') && (
        <Canvas
          camera={{ position: [0, 2, 10], fov: 55 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NoToneMapping
          }}
          dpr={[1, 2]}
        >
          <color attach="background" args={['#020810']} />
          <AnemoneScene
            config={config}
            analysisRef={analysisRef}
            mouseRef={mouseRef}
            heatRef={heatRef}
            depthModeRef={depthModeRef}
          />
        </Canvas>
      )}

      {loadPhase === 'done' && (
        <OverlayControls
          config={config}
          isPlaying={isPlaying}
          audioReady={audioReady}
          analysisRef={analysisRef}
          heatRef={heatRef}
          depthModeRef={depthModeRef}
          onConfigChange={handleConfigChange}
          onToggleAudio={handleToggleAudio}
        />
      )}
    </div>
  )
}
