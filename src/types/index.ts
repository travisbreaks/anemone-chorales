export type BiomeId = 'biolum' | 'abyss' | 'gravitas'

export interface Biome {
  id: BiomeId
  name: string
  base: string
  body: string
  tip: string
}

export interface AnemoneConfig {
  biome: BiomeId
  density: number
  flowSpeed: number
  reactivity: number
}

export interface AudioAnalysis {
  frequencyData: Uint8Array
  bassLevel: number
  midLevel: number
  trebleLevel: number
  transientLevel: number
  overallEnergy: number
  bpm: number
}

export const DEFAULT_CONFIG: AnemoneConfig = {
  biome: 'biolum',
  density: 16,
  flowSpeed: 1.0,
  reactivity: 0.65,
}
