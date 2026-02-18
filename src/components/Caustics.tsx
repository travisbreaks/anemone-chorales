import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Caustic light pattern projected onto a plane below/behind the anemone.
 * Uses a shader that generates animated caustic noise patterns.
 */
export default function CausticPlane() {
  const meshRef = useRef<THREE.Mesh>(null!)

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;

        // Simple 2D noise via sine combinations (cheap caustics)
        float caustic(vec2 p, float t) {
          float c = 0.0;
          c += sin(p.x * 3.7 + t * 0.4) * sin(p.y * 4.1 + t * 0.3);
          c += sin(p.x * 5.3 - t * 0.5 + p.y * 2.8) * 0.5;
          c += sin((p.x + p.y) * 6.0 + t * 0.6) * 0.3;
          return c * 0.5 + 0.5;
        }

        void main() {
          vec2 uv = vUv * 4.0 - 2.0; // scale UV for pattern density

          float c1 = caustic(uv, uTime);
          float c2 = caustic(uv * 1.3 + 1.7, uTime * 0.8);
          float pattern = c1 * c2;

          // Radial fade from center
          float dist = length(vUv - 0.5) * 2.0;
          float fade = smoothstep(1.0, 0.3, dist);

          float alpha = pattern * fade * 0.04;
          vec3 color = vec3(0.6, 0.7, 1.0); // cool blue-white

          gl_FragColor = vec4(color, alpha);
        }
      `,
    })
  }, [])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.getElapsedTime()
  })

  return (
    <mesh ref={meshRef} position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[40, 40]} />
    </mesh>
  )
}
