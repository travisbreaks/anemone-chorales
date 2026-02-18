import type { BiomeId, Biome } from '@/types'

export const BIOMES: Record<BiomeId, Biome> = {
  biolum: {
    id: 'biolum',
    name: 'BIOLUM',
    // Album art palette: deep violet → magenta/pink → cyan glow
    base: '#1E0836',
    body: '#8B3A9F',
    tip: '#4DE8D4',
  },
  abyss: {
    id: 'abyss',
    name: 'ABYSS',
    // Deep ocean descent: black void → deep ocean blue → cold steel blue
    base: '#010408',
    body: '#082B5A',
    tip: '#3B7DD8',
  },
  gravitas: {
    id: 'gravitas',
    name: 'GRAVITAS',
    // "A Path Unfolding" palette: warm black → dark gold → bright pyramid gold
    base: '#0A0800',
    body: '#8B6914',
    tip: '#C9A227',
  },
}
