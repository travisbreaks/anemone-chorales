import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const COUNT = 35

export default function Particles() {
  const pointsRef = useRef<THREE.Points>(null!)

  const { positions, velocities, opacities, wobblePhases, wobbleSpeeds } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const vel = new Float32Array(COUNT)
    const opa = new Float32Array(COUNT)
    const wPhase = new Float32Array(COUNT)
    const wSpeed = new Float32Array(COUNT)

    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 14
      pos[i * 3 + 1] = Math.random() * 14 - 2
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10
      vel[i] = 0.004 + Math.random() * 0.012
      // More translucent — like organic debris in water
      opa[i] = 0.04 + Math.random() * 0.1
      wPhase[i] = Math.random() * Math.PI * 2
      wSpeed[i] = 0.3 + Math.random() * 0.8
    }
    return { positions: pos, velocities: vel, opacities: opa, wobblePhases: wPhase, wobbleSpeeds: wSpeed }
  }, [])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1))
    return geo
  }, [positions, opacities])

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aOpacity;
        varying float vOpacity;
        void main() {
          vOpacity = aOpacity;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.5 + aOpacity * 2.5) * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vOpacity;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          // Softer, more translucent circles
          float alpha = smoothstep(1.0, 0.2, d) * vOpacity;
          // Slightly teal-tinted to match underwater environment
          vec3 color = vec3(0.8, 0.95, 1.0);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    })
  }, [])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.getElapsedTime()

    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    const t = state.clock.getElapsedTime()

    // Shared current direction — matches tentacle shader's ocean current
    const currentAngle = t * 0.08
    const currentX = Math.cos(currentAngle) * 0.003
    const currentZ = Math.sin(currentAngle) * 0.003

    for (let i = 0; i < COUNT; i++) {
      // Slow rise
      arr[i * 3 + 1] += velocities[i]

      // Wobble side-to-side like real particles in water
      const wobbleX = Math.sin(t * wobbleSpeeds[i] + wobblePhases[i]) * 0.005
      const wobbleZ = Math.cos(t * wobbleSpeeds[i] * 0.7 + wobblePhases[i] * 1.3) * 0.003
      arr[i * 3 + 0] += wobbleX + currentX
      arr[i * 3 + 2] += wobbleZ + currentZ

      // Occasional speed variation
      if (Math.random() < 0.002) {
        velocities[i] = 0.004 + Math.random() * 0.012
      }

      // Reset when above view
      if (arr[i * 3 + 1] > 12) {
        arr[i * 3 + 0] = (Math.random() - 0.5) * 14
        arr[i * 3 + 1] = -2 - Math.random() * 2
        arr[i * 3 + 2] = (Math.random() - 0.5) * 10
      }
    }
    posAttr.needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} />
}
