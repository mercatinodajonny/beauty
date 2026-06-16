import { T } from '../../styles/tokens'

export function StarRating({ value, onChange, size = 26 }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          onClick={() => onChange && onChange(i)}
          style={{ fontSize: size, background: 'none', border: 'none', cursor: onChange ? 'pointer' : 'default', color: i <= value ? T.gold : '#D1D5DB', padding: 0 }}
        >
          {i <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}
