import type { AudioAnalysis } from '@/types'

/**
 * Real audio analyzer using Web Audio API.
 * Plays an MP3 and extracts frequency data via AnalyserNode.
 *
 * FFT bin mapping (fftSize=1024, 44.1kHz → ~43Hz per bin):
 *   Bass:   bins 1-5   →  43-215Hz  (kick drums, sub-bass fundamentals)
 *   Mids:   bins 5-40  → 215-1720Hz (warmth, melodic content, synth body)
 *   Treble: bins 40-120 → 1720-5160Hz (presence, hi-hats, sparkle)
 *
 * Transient detector: tracks frame-over-frame bass delta.
 * Large jumps (kick hits, drops) produce a brief spike that decays fast.
 */
export class AudioAnalyzer {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaElementAudioSourceNode | null = null
  private audioElement: HTMLAudioElement | null = null
  private frequencyData = new Uint8Array(512)
  private bassLevel = 0
  private midLevel = 0
  private trebleLevel = 0
  private _isPlaying = false

  // Transient detection state
  private prevBassRaw = 0
  private transientLevel = 0

  // External callback for when OS pauses audio (phone sleep, tab switch, etc.)
  onStateChange: ((playing: boolean) => void) | null = null
  // Loading progress callback (0-1)
  onProgress: ((progress: number) => void) | null = null

  get isPlaying() {
    return this._isPlaying
  }

  async init(audioUrl: string): Promise<HTMLAudioElement> {
    this.audioContext = new AudioContext()

    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.82

    this.audioElement = new Audio(audioUrl)
    this.audioElement.crossOrigin = 'anonymous'
    this.audioElement.loop = true
    this.audioElement.preload = 'auto'

    // Track buffering progress
    this.audioElement.addEventListener('progress', () => {
      const el = this.audioElement!
      if (el.buffered.length > 0 && el.duration > 0) {
        const buffered = el.buffered.end(el.buffered.length - 1)
        this.onProgress?.(Math.min(buffered / el.duration, 1))
      }
    })

    // Sync _isPlaying when the OS pauses/plays the audio (phone sleep, interrupts)
    this.audioElement.addEventListener('pause', () => {
      if (this._isPlaying) {
        this._isPlaying = false
        this.zeroLevels()
        this.onStateChange?.(false)
      }
    })
    this.audioElement.addEventListener('play', () => {
      if (!this._isPlaying) {
        this._isPlaying = true
        this.onStateChange?.(true)
      }
    })

    this.source = this.audioContext.createMediaElementSource(this.audioElement)
    this.source.connect(this.analyser)
    this.analyser.connect(this.audioContext.destination)

    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount)

    // Wait until enough audio is buffered to start playback
    // Mobile browsers won't preload — timeout after 3s so the UI isn't stuck on "LOADING..."
    await new Promise<void>((resolve) => {
      let resolved = false
      const done = () => {
        if (resolved) return
        resolved = true
        this.onProgress?.(1)
        resolve()
      }
      const el = this.audioElement!
      const check = () => {
        if (el.readyState >= 3) done() // HAVE_FUTURE_DATA
      }
      el.addEventListener('canplay', check)
      check() // might already be ready (cached)
      setTimeout(done, 3000) // mobile fallback
    })

    return this.audioElement
  }

  async play() {
    if (!this.audioElement || !this.audioContext) return
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
    await this.audioElement.play()
    this._isPlaying = true
  }

  pause() {
    if (!this.audioElement) return
    this.audioElement.pause()
    this._isPlaying = false
    this.zeroLevels()
  }

  private zeroLevels() {
    this.bassLevel = 0
    this.midLevel = 0
    this.trebleLevel = 0
    this.transientLevel = 0
    this.prevBassRaw = 0
    this.frequencyData.fill(0)
  }

  async toggle() {
    if (this._isPlaying) {
      this.pause()
    } else {
      await this.play()
    }
  }

  tick(): void {
    if (!this.analyser) return

    this.analyser.getByteFrequencyData(this.frequencyData)

    // Bass: bins 1-5 (~43-215Hz) — focused on kick drum fundamentals
    // Skip bin 0 (DC offset, often noisy)
    let rawBass = 0
    for (let i = 1; i <= 5; i++) {
      rawBass += this.frequencyData[i]
    }
    rawBass = (rawBass / 5) / 255

    // Mids: bins 5-40 (~215-1720Hz) — warmth through melodic body
    let rawMid = 0
    for (let i = 5; i < 40; i++) {
      rawMid += this.frequencyData[i]
    }
    rawMid = (rawMid / 35) / 255

    // Treble: bins 40-120 (~1720-5160Hz) — presence, hi-hats, sparkle
    let rawTreble = 0
    const trebleEnd = Math.min(120, this.frequencyData.length)
    for (let i = 40; i < trebleEnd; i++) {
      rawTreble += this.frequencyData[i]
    }
    rawTreble = (rawTreble / (trebleEnd - 40)) / 255

    // ── Transient detection ──
    // Compare current raw bass to previous frame. Big jump = transient (kick, drop)
    const bassDelta = rawBass - this.prevBassRaw
    this.prevBassRaw = rawBass

    // Only positive deltas (onset, not release)
    if (bassDelta > 0.08) {
      // Scale the spike by how big the jump is
      const spike = Math.min((bassDelta - 0.08) * 4.0, 1.0)
      this.transientLevel = Math.max(this.transientLevel, spike)
    }
    // Fast decay — transient is brief (snappy, not lingering)
    this.transientLevel *= 0.85

    // Lerped smoothing — "heavy liquid" feel
    // Slightly faster rise than before for better transient tracking
    this.bassLevel += (rawBass - this.bassLevel) * 0.14
    this.midLevel += (rawMid - this.midLevel) * 0.12
    this.trebleLevel += (rawTreble - this.trebleLevel) * 0.15
  }

  getAnalysis(): AudioAnalysis {
    return {
      frequencyData: this.frequencyData,
      bassLevel: this.bassLevel,
      midLevel: this.midLevel,
      trebleLevel: this.trebleLevel,
      transientLevel: this.transientLevel,
      overallEnergy: (this.bassLevel * 0.4 + this.midLevel * 0.35 + this.trebleLevel * 0.25),
      bpm: 120,
    }
  }

  dispose() {
    this.pause()
    if (this.audioElement) {
      this.audioElement.src = ''
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
  }
}
