import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BIOMES } from '@/biomes'
import {
  createAnemoneGeometry,
  createAnemoneMaterial,
  updateAnemoneUniforms,
  updateBiomeUniforms,
} from '@/shaders/anemoneShader'
import type { AnemoneConfig, AudioAnalysis } from '@/types'
import CausticPlane from './Caustics'
import OceanBackground from './OceanBackground'
import Particles from './Particles'
import ReefGround from './ReefGround'

interface Props {
  config: AnemoneConfig
  analysisRef: React.RefObject<AudioAnalysis>
  mouseRef: React.RefObject<{ x: number; y: number }>
  heatRef: React.MutableRefObject<number>
  depthModeRef: React.MutableRefObject<{ mode: 'normal' | 'ascending' | 'paused'; pauseUntil: number }>
}

// ── Ribbed organic base geometry ──
function createAnemoneBase(): THREE.BufferGeometry {
  const widthSegs = 48
  const heightSegs = 24
  const geo = new THREE.SphereGeometry(0.95, widthSegs, heightSegs)
  const pos = geo.attributes.position
  const norm = geo.attributes.normal

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    const angle = Math.atan2(z, x)
    const ribCount = 14
    const rib = Math.sin(angle * ribCount) * 0.06

    const yNorm = y / 0.95
    const ribStrength = Math.max(0, 1.0 - Math.abs(yNorm) ** 1.2)

    const bulge = 1.0 + Math.sin((yNorm + 0.3) * Math.PI) * 0.12

    const nx = norm.getX(i)
    const nz = norm.getZ(i)
    const nLen = Math.sqrt(nx * nx + nz * nz)

    if (nLen > 0.01) {
      const ribDisplace = rib * ribStrength
      pos.setX(i, (x + (nx / nLen) * ribDisplace) * bulge)
      pos.setZ(i, (z + (nz / nLen) * ribDisplace) * bulge)
    }

    pos.setY(i, y * 0.7)
  }

  geo.computeVertexNormals()
  return geo
}

// ── Load coral texture ──
const coralTextureLoader = new THREE.TextureLoader()
let coralTexture: THREE.Texture | null = null
coralTextureLoader.load('./coral-texture.png', (tex) => {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  coralTexture = tex
})

// ── Base material: coral-textured organic shader ──
function createBaseMaterial(baseColor: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(baseColor) },
      uCoralTex: { value: null as THREE.Texture | null },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vY;
      varying vec2 vUv;
      void main() {
        vec3 pos = position;
        vec3 n = normalize(normal);
        pos += n * sin(uTime * 0.5) * 0.015;

        vNormal = normalize(normalMatrix * normal);
        vY = position.y;
        vUv = uv * 2.0; // tile the texture 2x for detail
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform sampler2D uCoralTex;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying float vY;
      varying vec2 vUv;
      void main() {
        vec3 viewDir = normalize(vViewPosition);
        vec3 n = normalize(vNormal);
        float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 2.5);

        // Sample coral texture and tint with biome color
        vec3 texColor = texture2D(uCoralTex, vUv).rgb;
        // Blend: 40% texture detail, 60% biome color tint
        float yFactor = smoothstep(-0.7, 0.5, vY);
        vec3 baseColor = uColor * (0.6 + yFactor * 0.4);
        vec3 color = mix(baseColor, texColor * uColor * 2.0, 0.4);

        // Bumpy highlights from texture luminance
        float texLum = dot(texColor, vec3(0.299, 0.587, 0.114));
        color += uColor * texLum * 0.3;

        color += uColor * fresnel * 0.35;

        float sss = pow(max(dot(-viewDir, n), 0.0), 4.0) * 0.1;
        color += uColor * sss;

        float alpha = 0.9 + fresnel * 0.1;
        gl_FragColor = vec4(clamp(color, 0.0, 10.0), alpha);
      }
    `,
  })
}

export default function AnemoneScene({ config, analysisRef, mouseRef, heatRef, depthModeRef }: Props) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const groupRef = useRef<THREE.Group>(null!)
  const cameraTargetRef = useRef({ x: 0, y: 2 })
  // Audio-driven group physics (not camera — keeps background stable)
  const groupShoveRef = useRef(0)
  const groupShakeRef = useRef({ x: 0, z: 0 })
  // Smoothed intensity — rises fast, decays slow (perceived impact)
  const intensityRef = useRef(0)

  const biome = BIOMES[config.biome]

  const geometry = useMemo(() => createAnemoneGeometry(config.density), [config.density])

  const material = useMemo(() => createAnemoneMaterial(BIOMES.biolum), [])

  const baseGeometry = useMemo(() => createAnemoneBase(), [])
  const baseMaterial = useMemo(() => createBaseMaterial(BIOMES.biolum.base), [])

  useEffect(() => {
    updateBiomeUniforms(material, biome)
    baseMaterial.uniforms.uColor.value.set(biome.base)
  }, [material, baseMaterial, biome])

  // Per-frame: read refs directly — zero React re-renders
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const analysis = analysisRef.current!
    const mouse = mouseRef.current!

    // ── Perceived Intensity ──
    // Non-linear combo: bass hits hardest, weighted toward peaks
    const rawIntensity = analysis.bassLevel ** 0.8 * 0.5 + analysis.midLevel ** 0.9 * 0.3 + analysis.trebleLevel * 0.2
    // Fast rise (0.15), slow decay (0.03) — hits feel punchy, decay feels organic
    const target = Math.min(rawIntensity, 1.0)
    const rate = target > intensityRef.current ? 0.15 : 0.03
    intensityRef.current += (target - intensityRef.current) * rate

    // ── Depth: Leaky Integrator (ocean descent) ──
    // Three modes: normal (energy-driven), ascending (smooth rise to surface), paused (hold at surface)
    const dm = depthModeRef.current

    if (dm.mode === 'ascending') {
      // Smooth ascent — ~8s from abyssal to surface
      heatRef.current -= 0.002
      if (heatRef.current <= 0) {
        heatRef.current = 0
        dm.mode = 'paused'
        dm.pauseUntil = t + 2 // hold at surface for 2 seconds
      }
    } else if (dm.mode === 'paused') {
      // Hold at surface, then resume normal
      heatRef.current = 0
      if (t >= dm.pauseUntil) {
        dm.mode = 'normal'
      }
    } else {
      // Normal: energy-driven descent/ascent
      const currentEnergy = (analysis.bassLevel + analysis.midLevel + analysis.trebleLevel) / 3
      const depthThreshold = 0.12
      if (currentEnergy > depthThreshold) {
        const excess = currentEnergy - depthThreshold
        heatRef.current += 0.0005 * excess * (1.0 + heatRef.current * 0.2)
      } else {
        heatRef.current -= 0.0004
      }
    }
    heatRef.current = Math.max(0, Math.min(1, heatRef.current))

    updateAnemoneUniforms(
      material,
      t,
      analysis.bassLevel,
      analysis.midLevel,
      analysis.trebleLevel,
      config.flowSpeed,
      config.reactivity,
      intensityRef.current,
      heatRef.current,
      analysis.transientLevel,
    )

    baseMaterial.uniforms.uTime.value = t
    if (coralTexture && !baseMaterial.uniforms.uCoralTex.value) {
      baseMaterial.uniforms.uCoralTex.value = coralTexture
    }

    // ── Group Physics (heat-staged, not camera — keeps background stable) ──
    const heat = heatRef.current

    // Stage 1 (heat < 0.3): no beat reaction, just gentle float
    // Stage 2 (heat 0.3-0.7): bass shove engages
    // Stage 3 (heat > 0.7): full shake + shove
    const shoveGate = Math.max(0, (heat - 0.2) / 0.5) // 0 at heat 0.2, 1 at heat 0.7
    const shakeGate = Math.max(0, (heat - 0.5) / 0.5) // 0 at heat 0.5, 1 at heat 1.0

    // BASS SURGE: smooth push toward camera (stage 2+)
    const bassShoveTarget = analysis.bassLevel * shoveGate * 0.5
    const shoveRate = bassShoveTarget > groupShoveRef.current ? 0.06 : 0.015
    groupShoveRef.current += (bassShoveTarget - groupShoveRef.current) * shoveRate

    // ENERGY SHAKE: vibration only in stage 3 (overdrive)
    const shakeAmount = shakeGate * 0.03
    const shakeTargetX = Math.sin(t * 7.3) * shakeAmount + Math.sin(t * 11.1) * shakeAmount * 0.4
    const shakeTargetZ = Math.cos(t * 5.7) * shakeAmount + Math.sin(t * 8.9) * shakeAmount * 0.4
    groupShakeRef.current.x += (shakeTargetX - groupShakeRef.current.x) * 0.04
    groupShakeRef.current.z += (shakeTargetZ - groupShakeRef.current.z) * 0.04

    if (groupRef.current) {
      groupRef.current.position.x = groupShakeRef.current.x
      groupRef.current.position.z = groupShoveRef.current + groupShakeRef.current.z
    }

    // Mouse parallax (camera only — smooth, stable)
    const targetX = mouse.x * 0.15
    const targetY = 2 + mouse.y * 0.08
    cameraTargetRef.current.x += (targetX - cameraTargetRef.current.x) * 0.02
    cameraTargetRef.current.y += (targetY - cameraTargetRef.current.y) * 0.02

    state.camera.position.x = cameraTargetRef.current.x
    state.camera.position.y = cameraTargetRef.current.y
    state.camera.lookAt(0, 1, 0)
  })

  return (
    <>
      <OceanBackground mouseRef={mouseRef} />
      <Particles />
      <ReefGround />
      <CausticPlane />

      <group ref={groupRef} position={[0, -0.3, 0]} scale={0.9}>
        <mesh position={[0, -0.2, 0]} geometry={baseGeometry} material={baseMaterial} />
        <mesh ref={meshRef} geometry={geometry} material={material} />
      </group>

      <ambientLight intensity={0.06} color="#1a3040" />
      <pointLight position={[0, 10, 4]} intensity={0.35} color="#88ccdd" />
      <pointLight position={[-4, -2, 6]} intensity={0.12} color="#4488aa" />
      <pointLight position={[3, 6, -2]} intensity={0.08} color="#66aacc" />
    </>
  )
}
