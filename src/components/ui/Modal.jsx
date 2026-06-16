import { T } from '../../styles/tokens'

export function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: T.white, borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 430, margin: '0 auto', padding: '18px 20px 44px', maxHeight: '90dvh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: T.ink, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: T.surface, border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
