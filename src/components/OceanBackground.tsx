import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

interface Props {
  mouseRef: React.RefObject<{ x: number; y: number }>
}

const BOKEH_COUNT = 25
const RAY_COUNT = 7

export default function OceanBackground({ mouseRef }: Props) {
  const smoothMouse = useRef({ x: 0, y: 0 })
  const bgRef = useRef<THREE.Mesh>(null!)
  const raysRef = useRef<THREE.Group>(null!)
  const bokehRef = useRef<THREE.Points>(null!)
  const bokehFarRef = useRef<THREE.Points>(null!)

  // ── Ocean gradient backdrop ──
  const bgMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: { uTime: { value: 0 } },
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
      void main() {
        // Rich underwater gradient inspired by reference photos
        vec3 clear   = vec3(0.00784, 0.03137, 0.06275); // exact #020810
        vec3 abyss   = vec3(0.008, 0.015, 0.04);    // near-black deep
        vec3 deep    = vec3(0.015, 0.04, 0.10);      // dark navy
        vec3 mid     = vec3(0.02, 0.08, 0.18);       // deep blue
        vec3 upper   = vec3(0.03, 0.14, 0.28);       // teal
        vec3 surface = vec3(0.05, 0.22, 0.35);       // bright teal at top

        float y = vUv.y;
        vec3 color = mix(abyss, deep, smoothstep(0.0, 0.2, y));
        color = mix(color, mid, smoothstep(0.2, 0.45, y));
        color = mix(color, upper, smoothstep(0.45, 0.7, y));
        color = mix(color, surface, smoothstep(0.7, 1.0, y));

        // Edge taper — fade to clear color at all edges so resizing never shows a hard line
        float edgeX = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float edgeY = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        color = mix(clear, color, edgeX * edgeY);

        // Subtle animated caustic shimmer on the gradient
        float shimmer = sin(vUv.x * 8.0 + uTime * 0.15) * sin(vUv.y * 6.0 + uTime * 0.1) * 0.008;
        color += shimmer;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
      }),
    [],
  )

  // ── God rays from surface ──
  const rayMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uOpacity: { value: 0.04 },
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
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        // Cone shape: wider at bottom, narrow at top
        float width = mix(0.5, 0.1, vUv.y);
        float edgeFade = smoothstep(width, width * 0.3, abs(vUv.x - 0.5));
        // Stronger at top (light source), fading down
        float topFade = pow(vUv.y, 0.8);
        // Animated shimmer / dust in the beam
        float dust = 0.7 + 0.3 * sin(vUv.y * 20.0 - uTime * 0.4 + vUv.x * 5.0);
        float alpha = edgeFade * topFade * uOpacity * dust;
        // Warm teal-white light
        vec3 color = vec3(0.5, 0.9, 1.0);
        gl_FragColor = vec4(color, alpha);
      }
    `,
      }),
    [],
  )

  // ── Ray configs ──
  const rays = useMemo(
    () =>
      Array.from({ length: RAY_COUNT }, (_, i) => ({
        x: (i - (RAY_COUNT - 1) / 2) * 2.2 + (Math.random() - 0.5) * 1.0,
        width: 1.5 + Math.random() * 2.0,
        opacity: 0.015 + Math.random() * 0.03,
        angle: (Math.random() - 0.5) * 0.12,
        phase: Math.random() * Math.PI * 2,
      })),
    [],
  )

  // ── Bokeh orbs (mid-distance) ──
  const bokehData = useMemo(() => {
    const pos = new Float32Array(BOKEH_COUNT * 3)
    const sizes = new Float32Array(BOKEH_COUNT)
    const opacities = new Float32Array(BOKEH_COUNT)
    for (let i = 0; i < BOKEH_COUNT; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 28
      pos[i * 3 + 1] = Math.random() * 18 - 3
      pos[i * 3 + 2] = -8 - Math.random() * 12
      sizes[i] = 6 + Math.random() * 18
      opacities[i] = 0.008 + Math.random() * 0.02
    }
    return { pos, sizes, opacities }
  }, [])

  const bokehGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(bokehData.pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(bokehData.sizes, 1))
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(bokehData.opacities, 1))
    return geo
  }, [bokehData])

  // ── Bokeh orbs (far background — bigger, dimmer) ──
  const bokehFarData = useMemo(() => {
    const count = 12
    const pos = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const opacities = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 34
      pos[i * 3 + 1] = Math.random() * 22 - 4
      pos[i * 3 + 2] = -16 - Math.random() * 10
      sizes[i] = 12 + Math.random() * 30
      opacities[i] = 0.004 + Math.random() * 0.012
    }
    return { pos, sizes, opacities, count }
  }, [])

  const bokehFarGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(bokehFarData.pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(bokehFarData.sizes, 1))
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(bokehFarData.opacities, 1))
    return geo
  }, [bokehFarData])

  const bokehMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {},
        vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aOpacity;
      varying float vOpacity;
      void main() {
        vOpacity = aOpacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
        fragmentShader: /* glsl */ `
      varying float vOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        // Soft gaussian-ish glow — no hard ring
        float alpha = smoothstep(1.0, 0.0, d);
        alpha = alpha * alpha * vOpacity;
        vec3 color = vec3(0.35, 0.65, 0.75);
        gl_FragColor = vec4(color, alpha);
      }
    `,
      }),
    [],
  )

  useFrame((state) => {
    const t = state.clock.getElapsedTime()

    const mouse = mouseRef.current!
    smoothMouse.current.x += (mouse.x - smoothMouse.current.x) * 0.015
    smoothMouse.current.y += (mouse.y - smoothMouse.current.y) * 0.015
    const mx = smoothMouse.current.x
    const my = smoothMouse.current.y

    bgMaterial.uniforms.uTime.value = t

    // Background parallax (very subtle — farthest away)
    if (bgRef.current) {
      bgRef.current.position.x = mx * 0.05
      bgRef.current.position.y = 3 + my * 0.03
    }

    // God rays parallax + sway
    if (raysRef.current) {
      raysRef.current.position.x = mx * 0.08
      raysRef.current.position.y = 14 + my * 0.05
      raysRef.current.rotation.z = Math.sin(t * 0.06) * 0.015
      raysRef.current.children.forEach((child) => {
        const mesh = child as THREE.Mesh
        const mat = mesh.material as THREE.ShaderMaterial
        if (mat.uniforms?.uTime) mat.uniforms.uTime.value = t
      })
    }

    // Mid bokeh parallax
    if (bokehRef.current) {
      bokehRef.current.position.x = mx * 0.06
      bokehRef.current.position.y = my * 0.04
    }

    // Far bokeh parallax (slightly more movement for depth)
    if (bokehFarRef.current) {
      bokehFarRef.current.position.x = mx * 0.1
      bokehFarRef.current.position.y = my * 0.06
    }
  })

  return (
    <>
      {/* Ocean gradient — far back, oversized to never show edges */}
      <mesh ref={bgRef} position={[0, 3, -22]} material={bgMaterial}>
        <planeGeometry args={[120, 80]} />
      </mesh>

      {/* God rays from the surface */}
      <group ref={raysRef} position={[0, 14, -8]}>
        {rays.map((ray, i) => {
          const mat = rayMaterial.clone()
          mat.uniforms.uOpacity.value = ray.opacity
          return (
            <mesh key={i} position={[ray.x, 0, 0]} rotation={[0, 0, ray.angle]} material={mat}>
              <planeGeometry args={[ray.width, 24]} />
            </mesh>
          )
        })}
      </group>

      {/* Far bokeh (deepest) */}
      <points ref={bokehFarRef} geometry={bokehFarGeo} material={bokehMaterial} />

      {/* Mid bokeh */}
      <points ref={bokehRef} geometry={bokehGeo} material={bokehMaterial} />
    </>
  )
}
