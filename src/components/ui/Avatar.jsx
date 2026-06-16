import { T } from '../../styles/tokens'

export function Avatar({ pro, size = 40, fs = 18 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, position: 'relative',
      background: `${pro.accent_color || pro.accent}22`,
      border: `1.5px solid ${pro.accent_color || pro.accent}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fs,
    }}>
      {pro.emoji}
      {pro.verified && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: Math.max(12, size * 0.22), height: Math.max(12, size * 0.22), borderRadius: '50%', background: T.green, border: `2px solid ${T.white}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M2 6l3 3 5-5" />
          </svg>
        </div>
      )}
    </div>
  )
}
