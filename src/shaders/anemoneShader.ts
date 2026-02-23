import * as THREE from 'three'
import type { Biome } from '@/types'

// ── Vertex Shader ──────────────────────────────────────────────
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uAudioLow;
  uniform float uAudioMid;
  uniform float uAudioHigh;
  uniform float uReactivity;
  uniform float uIntensity;
  uniform float uHeat;
  uniform float uTentacleLength;

  attribute float aTentaclePhase;

  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vFacing;

  // Cheap pseudo-noise: layered sines approximating Perlin coherence
  float noise2D(vec2 p) {
    return sin(p.x * 1.7 + p.y * 2.3) * 0.5
         + sin(p.x * 3.1 - p.y * 1.4) * 0.25
         + sin(p.x * 0.8 + p.y * 4.1) * 0.25;
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);

    float h = uv.y;
    vHeight = h;

    vec3 pos = position;
    float t = uTime * uFlowSpeed;
    float intensity = uIntensity;
    float heat = uHeat;

    // ── Heat stages for gating behaviors ──
    // Stage 1 (0-0.3): dormant. Stage 2 (0.3-0.7): reactive. Stage 3 (0.7-1.0): overdrive
    float reactGate = smoothstep(0.2, 0.5, heat);   // audio reactivity fades in
    float overdriveGate = smoothstep(0.6, 0.9, heat); // chaos behaviors fade in

    // 1. BASS → THICKNESS BULGE (dramatic pump on kicks)
    // Heat adds a persistent swell — creature looks "swollen" with energy
    float heatSwell = 1.0 + heat * 0.3;
    float bulge = heatSwell + (uAudioLow * uReactivity * reactGate * 1.2 * sin(h * 3.14159));
    // TIP FLARE — tips fatten on intense hits (gated by heat)
    float tipFlare = intensity * smoothstep(0.6, 1.0, h) * 0.8 * reactGate;
    bulge += tipFlare;
    pos.x *= bulge;
    pos.z *= bulge;

    // 2. OCEAN CURRENT — the dominant force (always active, heat just adds energy)
    float currentAngle = t * 0.08;
    float currentX = cos(currentAngle);
    float currentZ = sin(currentAngle);

    float currentStrength = 0.35 + sin(t * 0.12) * 0.12 + sin(t * 0.07) * 0.08;
    currentStrength += uAudioLow * uReactivity * reactGate * 1.8;

    // 3. INDIVIDUAL TENTACLE VARIATION (gated by heat stage 2+)
    float phase = aTentaclePhase;

    vec2 noiseCoord = vec2(pos.x * 0.5 + t * 0.3, pos.z * 0.5 + t * 0.2);
    float noiseVal = noise2D(noiseCoord + phase);

    float midBoost = 1.0 + uAudioMid * uReactivity * reactGate * 3.5;
    float individualX = sin(t * 0.6 + phase) * 0.3 * midBoost + noiseVal * 0.2;
    float individualZ = cos(t * 0.5 + phase * 1.3) * 0.25 * midBoost;

    // Treble = rapid flutter (gated by reactGate)
    float flutter = uAudioHigh * uReactivity * reactGate * 1.5;
    individualX += sin(t * 3.0 + phase + h * 4.0) * flutter;
    individualZ += cos(t * 2.5 + phase * 0.7 + h * 3.5) * flutter;

    // 4. HIGH-FREQUENCY JITTER — only in overdrive (heat > 0.7)
    float jitterStrength = intensity * uReactivity * overdriveGate * 0.6;
    float jitterX = sin(t * 11.0 + phase * 3.7 + h * 8.0) * jitterStrength;
    float jitterZ = cos(t * 9.3 + phase * 2.1 + h * 7.0) * jitterStrength;
    jitterX *= smoothstep(0.2, 0.8, h);
    jitterZ *= smoothstep(0.2, 0.8, h);
    individualX += jitterX;
    individualZ += jitterZ;

    // 5. BASS CURL — tentacles curl inward on kicks (gated by reactGate)
    float curlAmount = uAudioLow * uReactivity * reactGate * 0.4;
    float curlFlex = pow(h, 1.8);
    float baseAngle = atan(position.z, position.x);
    pos.x -= cos(baseAngle) * curlAmount * curlFlex;
    pos.z -= sin(baseAngle) * curlAmount * curlFlex;
    pos.y -= curlAmount * curlFlex * 0.3;

    // 6. COMBINE
    float swayX = currentX * currentStrength + individualX;
    float swayZ = currentZ * currentStrength + individualZ;

    float flexibility = pow(h, 2.2);
    pos.x += swayX * flexibility;
    pos.z += swayZ * flexibility;

    pos.y += currentStrength * flexibility * 0.12;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;

    float vLen = length(vViewPosition);
    vec3 viewDir = vLen > 0.001 ? vViewPosition / vLen : vec3(0.0, 0.0, 1.0);
    float nLen = length(vNormal);
    vec3 safeNormal = nLen > 0.001 ? vNormal / nLen : vec3(0.0, 1.0, 0.0);
    vFacing = max(dot(viewDir, safeNormal), 0.0);

    gl_Position = projectionMatrix * mvPosition;
  }
`

// ── Fragment Shader ────────────────────────────────────────────
// Color model: ENERGY-DRIVEN, not height-driven.
// Silent = base color everywhere. Loud = tip color. Music drives the spectrum.
// Tips are more sensitive (shift first), base follows.
const fragmentShader = /* glsl */ `
  uniform vec3 uColorBase;
  uniform vec3 uColorBody;
  uniform vec3 uColorTip;
  uniform float uTime;
  uniform float uAudioLow;
  uniform float uAudioMid;
  uniform float uAudioHigh;
  uniform float uIntensity;
  uniform float uHeat;
  uniform float uTransient;

  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vFacing;

  // Simple hash for per-fragment texture variation
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    vec3 n = normalize(vNormal);

    float energy = clamp(uAudioLow * 0.4 + uAudioMid * 0.35 + uAudioHigh * 0.25, 0.0, 1.0);
    float heat = uHeat;
    float transient = uTransient;

    // ── ADAPTIVE FRESNEL — tighter at high heat (anti-compression) ──
    float sharpness = 2.5 + heat * 2.0;
    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), sharpness);

    // ── ENERGY-DRIVEN COLOR: base → body → tip along audio spectrum ──
    float tipSensitivity = smoothstep(0.0, 0.8, vHeight);

    // colorDrive: reduce heat's persistent contribution so it doesn't flatten everything
    float colorDrive = energy * mix(0.4, 1.0, tipSensitivity) + heat * 0.15;
    colorDrive = clamp(colorDrive, 0.0, 1.0);

    // 3-stop gradient: base (0) → body (0.5) → tip (1.0)
    vec3 spectrumColor = mix(uColorBase, uColorBody, smoothstep(0.0, 0.5, colorDrive));
    spectrumColor = mix(spectrumColor, uColorTip, smoothstep(0.4, 1.0, colorDrive));

    // ── PER-FRAGMENT TEXTURE — increases with depth (more detail, not less) ──
    // Procedural surface variation that scales up with heat
    vec2 texCoord = vec2(vHeight * 8.0 + vFacing * 3.0, dot(n.xz, vec2(1.0)) * 5.0);
    float texNoise = hash(texCoord + vec2(uTime * 0.1));
    float textureVariation = mix(0.02, 0.15, heat) * (texNoise - 0.5);

    float brightness = mix(0.12, 1.0, colorDrive) + textureVariation;

    vec3 color = spectrumColor * brightness;

    // ── FREQUENCY-SPECIFIC ACCENTS ──
    color += uColorBody * uAudioLow * 0.4 * (1.0 - tipSensitivity);
    color += uColorBody * uAudioMid * 0.5 * smoothstep(0.2, 0.6, vHeight) * (1.0 - smoothstep(0.7, 1.0, vHeight));
    color += uColorTip * uAudioHigh * 0.5 * tipSensitivity;

    // ── TRANSIENT FLASH — kick hits punch through as bright tip flare ──
    float tipZone = smoothstep(0.55, 1.0, vHeight);
    float transientFlash = transient * tipZone * 1.5;
    color += uColorTip * transientFlash;
    // Transient also adds a brief white-hot core on the very tips
    color += vec3(1.0) * transient * smoothstep(0.8, 1.0, vHeight) * 0.4;

    // ── FRESNEL RIM — scales with energy + transient ──
    float rimIntensity = energy * 0.4 + heat * 0.15 + transient * 0.3;
    vec3 rimColor = mix(uColorBody, uColorTip, colorDrive);
    color += rimColor * fresnel * rimIntensity;

    // ── TIP GLOW (shader bloom replacement) ──
    // At depth, maintain glow but vary it per-fragment for texture
    float glowBase = 0.15 + energy * 1.0 + transient * 0.5;
    float glowVariation = 1.0 + textureVariation * mix(1.0, 4.0, heat);
    float glowStrength = tipZone * glowBase * glowVariation;
    glowStrength += fresnel * tipZone * 0.4;
    color += uColorTip * glowStrength;

    // ── HEAT DEPTH COLOR — at depth, shift toward body/tip MIX, not white ──
    // Creates richer deep-water look instead of washed-out white
    float depthTint = smoothstep(0.6, 1.0, heat) * tipZone * energy;
    vec3 deepColor = mix(uColorTip, uColorBody, 0.3) * 1.4;
    color = mix(color, deepColor, depthTint * 0.2);

    // ANGLE-REACTIVE: silhouette edges pick up more brightness
    float edgeBoost = (1.0 - vFacing) * 0.15 * energy;
    color += uColorTip * edgeBoost;

    // ── OPACITY: transparent when silent, solid when loud ──
    float baseAlpha = mix(0.15, 0.5, colorDrive);
    float tipAlpha = mix(0.25, 0.9, colorDrive);
    float alpha = mix(baseAlpha, tipAlpha, tipSensitivity);
    alpha += tipZone * glowStrength * 0.15;
    alpha += transient * tipZone * 0.2; // transient punches opacity too
    alpha *= mix(1.0, 0.85, fresnel);
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(clamp(color, 0.0, 10.0), alpha);
  }
`

// ── Geometry Builder ───────────────────────────────────────────
const SEGMENTS = 12
const RING_VERTS = 8
const BASE_RADIUS = 0.8
const TENTACLE_LENGTH = 5.0

// Seeded random for deterministic tentacle variation
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function createAnemoneGeometry(density: number): THREE.BufferGeometry {
  const vertsPerTentacle = (SEGMENTS + 1) * RING_VERTS
  const trisPerTentacle = SEGMENTS * RING_VERTS * 2
  const totalVerts = vertsPerTentacle * density
  const totalIndices = trisPerTentacle * 3 * density

  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  const uvs = new Float32Array(totalVerts * 2)
  const indices = new Uint32Array(totalIndices)
  const tentaclePhases = new Float32Array(totalVerts)

  let vertOffset = 0
  let idxOffset = 0

  for (let t = 0; t < density; t++) {
    const angle = (t / density) * Math.PI * 2
    const lengthScale = 0.7 + seededRandom(t * 7) * 0.6
    const length = TENTACLE_LENGTH * lengthScale

    // Per-tentacle random phase for independent sway
    const phase = seededRandom(t * 13 + 42) * Math.PI * 2

    // Tentacle base offset on the disc
    const baseX = Math.cos(angle) * BASE_RADIUS
    const baseZ = Math.sin(angle) * BASE_RADIUS

    // Build rings along the tentacle
    for (let s = 0; s <= SEGMENTS; s++) {
      const h = s / SEGMENTS // 0 = base, 1 = tip

      // Rounded bubble-tip: thin stalk that swells into a smooth bulb
      const stalk = 1.0 - h * 0.7 // gradual thin: 1.0 → 0.3
      const bulbStart = 0.5 // bulb starts earlier for smoother curve
      const bulb = Math.max(0, (h - bulbStart) / (1.0 - bulbStart)) ** 1.5
      // Close off at the very tip for roundness (not flat-ended)
      const tipClose = Math.max(0, (h - 0.9) / 0.1) ** 2.0
      const ringRadius = 0.08 * (stalk + bulb * 3.2) * (1.0 - tipClose * 0.5)

      // Tentacle centerline position (straight up, shader does the sway)
      const cx = baseX
      const cy = h * length
      const cz = baseZ

      for (let r = 0; r < RING_VERTS; r++) {
        const ringAngle = (r / RING_VERTS) * Math.PI * 2
        const vi = vertOffset + s * RING_VERTS + r

        const nx = Math.cos(ringAngle)
        const nz = Math.sin(ringAngle)

        positions[vi * 3 + 0] = cx + nx * ringRadius
        positions[vi * 3 + 1] = cy
        positions[vi * 3 + 2] = cz + nz * ringRadius

        normals[vi * 3 + 0] = nx
        normals[vi * 3 + 1] = 0
        normals[vi * 3 + 2] = nz

        uvs[vi * 2 + 0] = r / RING_VERTS
        uvs[vi * 2 + 1] = h

        // Same phase for all verts of this tentacle
        tentaclePhases[vi] = phase
      }
    }

    // Build triangle indices
    for (let s = 0; s < SEGMENTS; s++) {
      for (let r = 0; r < RING_VERTS; r++) {
        const nextR = (r + 1) % RING_VERTS
        const i0 = vertOffset + s * RING_VERTS + r
        const i1 = vertOffset + s * RING_VERTS + nextR
        const i2 = vertOffset + (s + 1) * RING_VERTS + r
        const i3 = vertOffset + (s + 1) * RING_VERTS + nextR

        indices[idxOffset++] = i0
        indices[idxOffset++] = i2
        indices[idxOffset++] = i1

        indices[idxOffset++] = i1
        indices[idxOffset++] = i2
        indices[idxOffset++] = i3
      }
    }

    vertOffset += vertsPerTentacle
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('aTentaclePhase', new THREE.BufferAttribute(tentaclePhases, 1))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))

  return geometry
}

// ── Material Factory ───────────────────────────────────────────
export function createAnemoneMaterial(biome: Biome): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFlowSpeed: { value: 1.0 },
      uAudioLow: { value: 0.0 },
      uAudioMid: { value: 0.0 },
      uAudioHigh: { value: 0.0 },
      uReactivity: { value: 0.85 },
      uIntensity: { value: 0.0 },
      uHeat: { value: 0.0 },
      uTransient: { value: 0.0 },
      uTentacleLength: { value: TENTACLE_LENGTH },
      uColorBase: { value: new THREE.Color(biome.base) },
      uColorBody: { value: new THREE.Color(biome.body) },
      uColorTip: { value: new THREE.Color(biome.tip) },
    },
  })
}

// ── Uniform Updater ────────────────────────────────────────────
export function updateAnemoneUniforms(
  material: THREE.ShaderMaterial,
  time: number,
  bassLevel: number,
  midLevel: number,
  trebleLevel: number,
  flowSpeed: number,
  reactivity: number,
  intensity: number,
  heat: number,
  transient: number,
) {
  material.uniforms.uTime.value = time
  material.uniforms.uFlowSpeed.value = flowSpeed
  material.uniforms.uAudioLow.value = bassLevel
  material.uniforms.uAudioMid.value = midLevel
  material.uniforms.uAudioHigh.value = trebleLevel
  material.uniforms.uReactivity.value = reactivity
  material.uniforms.uIntensity.value = intensity
  material.uniforms.uHeat.value = heat
  material.uniforms.uTransient.value = transient
}

export function updateBiomeUniforms(material: THREE.ShaderMaterial, biome: Biome) {
  material.uniforms.uColorBase.value.set(biome.base)
  material.uniforms.uColorBody.value.set(biome.body)
  material.uniforms.uColorTip.value.set(biome.tip)
}
