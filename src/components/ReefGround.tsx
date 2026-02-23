import { useLoader } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Coral reef image mapped to a ground plane beneath the anemone.
 * Edges fade to transparent so it blends into the dark ocean.
 */
export default function ReefGround() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const texture = useLoader(THREE.TextureLoader, './coral-reef.jpg')

  const material = useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTexture: { value: texture },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(uTexture, vUv);

          // Darken to match the deep ocean mood
          vec3 color = tex.rgb * 0.35;

          // Radial fade — strong center, transparent edges
          float dist = length(vUv - 0.5) * 2.0;
          float fade = smoothstep(1.0, 0.4, dist);

          // Bottom edge fade (so reef blends into void below camera)
          float bottomFade = smoothstep(0.0, 0.25, vUv.y);

          gl_FragColor = vec4(color, fade * bottomFade * 0.85);
        }
      `,
    })
  }, [texture])

  return (
    <mesh ref={meshRef} position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[18, 12]} />
    </mesh>
  )
}
