interface Props {
  progress: number // 0-1
  phase: 'loading' | 'ready' | 'transition' | 'done'
  onEnter: () => void
}

/**
 * Loading screen: album art, anemone icon, and a button that fills
 * with progress (showing XX%) then switches to "ENTER" when ready.
 * Content is inside a glass card matching the controls-panel aesthetic.
 */
export default function LoadingScreen({ progress, phase, onEnter }: Props) {
  const isFading = phase === 'transition'
  const isReady = phase === 'ready'
  const pct = Math.round(progress * 100)

  // Anemone tendrils sway based on progress
  const tendrilCount = 14
  const tendrils = Array.from({ length: tendrilCount }, (_, i) => {
    const angle = (i / tendrilCount) * Math.PI * 2
    const baseLen = 22 + Math.sin(i * 2.3) * 5
    const len = baseLen * (0.3 + progress * 0.7)
    const sway = Math.sin(i * 1.7 + progress * 6) * (4 + progress * 7)
    const tipX = Math.cos(angle) * len + sway * 0.3
    const tipY = Math.sin(angle) * len + Math.cos(i * 2.1 + progress * 4) * 3
    const cpX = Math.cos(angle) * len * 0.5 + sway * 0.6
    const cpY = Math.sin(angle) * len * 0.5
    return { tipX, tipY, cpX, cpY, angle, len, i }
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: '#020810',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isFading ? 0 : 1,
        transition: 'opacity 0.7s ease-out',
        pointerEvents: isFading ? 'none' : 'auto',
        // Force own GPU compositing layer — prevents WebGL canvas from punching through
        transform: 'translateZ(0)',
      }}
    >
      {/* Glass card — matches controls-panel aesthetic */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          padding: '2rem 2.5rem',
          borderRadius: '24px',
          border: '1px solid rgba(196, 91, 160, 0.06)',
          background:
            'radial-gradient(ellipse at center, rgba(10, 4, 18, 0.92) 0%, rgba(10, 4, 18, 0.82) 60%, rgba(10, 4, 18, 0.65) 100%)',
        }}
      >
        {/* Album art */}
        <img
          src="./album-art.png"
          alt="Anemone Chorales Vol. 1"
          style={{
            width: '45vmin',
            maxWidth: '280px',
            height: 'auto',
            aspectRatio: '1',
            objectFit: 'cover',
            borderRadius: '12px',
            display: 'block',
          }}
        />

        {/* Progress button — fills left-to-right, shows %, then "ENTER" */}
        <button
          onClick={isReady ? onEnter : undefined}
          style={{
            position: 'relative',
            width: '100%',
            padding: '0.7rem 0',
            fontFamily: "'Syncopate', sans-serif",
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '3px',
            border: '1px solid rgba(107, 232, 217, 0.25)',
            borderRadius: '8px',
            background: 'transparent',
            color: isReady ? '#020810' : 'rgba(107, 232, 217, 0.7)',
            cursor: isReady ? 'pointer' : 'default',
            overflow: 'hidden',
            transition: 'color 0.3s, border-color 0.3s',
            ...(isReady ? { borderColor: 'rgba(107, 232, 217, 0.6)' } : {}),
          }}
          onMouseEnter={(e) => {
            if (isReady) {
              e.currentTarget.style.borderColor = 'rgba(107, 232, 217, 0.9)'
              e.currentTarget.style.transform = 'scale(1.02)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isReady ? 'rgba(107, 232, 217, 0.6)' : 'rgba(107, 232, 217, 0.25)'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          {/* Fill background */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${pct}%`,
              background: 'rgba(107, 232, 217, 0.85)',
              transition: 'width 0.15s ease-out',
              zIndex: 0,
            }}
          />
          <span style={{ position: 'relative', zIndex: 1 }}>{isReady ? 'ENTER' : `${pct}%`}</span>
        </button>

        {/* Anemone icon */}
        <svg
          viewBox="-45 -45 90 90"
          width="100"
          height="100"
          style={{
            overflow: 'visible',
            filter: 'drop-shadow(0 0 8px rgba(107, 232, 217, 0.3))',
          }}
        >
          <defs>
            <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#4DE8D4" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8B3A9F" stopOpacity="0.6" />
            </radialGradient>
            <linearGradient id="tendrilGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B3A9F" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#4DE8D4" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {tendrils.map((t) => (
            <path
              key={t.i}
              d={`M 0 0 Q ${t.cpX} ${t.cpY} ${t.tipX} ${t.tipY}`}
              fill="none"
              stroke="url(#tendrilGrad)"
              strokeWidth={1.4 + Math.sin(t.i * 1.3) * 0.4}
              strokeLinecap="round"
              opacity={0.5 + progress * 0.5}
            />
          ))}

          {tendrils
            .filter((_, i) => progress > 0.3 + i * 0.04)
            .map((t) => (
              <circle
                key={`tip-${t.i}`}
                cx={t.tipX}
                cy={t.tipY}
                r={1.2 + progress * 1}
                fill="#4DE8D4"
                opacity={0.6 + progress * 0.3}
              />
            ))}

          <circle cx={0} cy={0} r={5 + progress * 2.5} fill="url(#coreGrad)" />
          <circle cx={0} cy={0} r={7 + progress * 4} fill="none" stroke="rgba(107, 232, 217, 0.15)" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}
