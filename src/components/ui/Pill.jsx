import { T } from '../../styles/tokens'

export function Pill({ label, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, ...style }}>
      {label}
    </span>
  )
}
