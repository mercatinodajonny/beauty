import { T } from '../../styles/tokens'

export function BigBtn({ label, onClick, variant = 'dark', disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '15px 0', borderRadius: 13, border: 'none',
        cursor: disabled ? 'default' : 'pointer', fontSize: 15, fontWeight: 600,
        background: variant === 'dark' ? T.ink : T.surface,
        color: variant === 'dark' ? T.white : T.ink,
        opacity: disabled ? 0.35 : 1, fontFamily: 'inherit', ...style,
      }}
    >
      {label}
    </button>
  )
}

export function Btn({ label, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: 9, border: `1.5px solid ${T.line}`,
        background: T.white, cursor: 'pointer', fontSize: 13, fontWeight: 500,
        color: T.inkMid, fontFamily: 'inherit', ...style,
      }}
    >
      {label}
    </button>
  )
}

export function BackBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: T.ink, fontSize: 14, fontWeight: 500, fontFamily: 'inherit',
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
      Indietro
    </button>
  )
}
