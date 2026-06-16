import { useState } from 'react'
import { T } from '../../styles/tokens'
import { CLIENTS0 } from '../../lib/constants'

export default function ClientiPage({ onNav }) {
  const [q, setQ] = useState('')
  const [clients] = useState(CLIENTS0)

  const results = clients.filter(c =>
    q.length < 2 || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone || '').includes(q)
  )

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '50px 16px 10px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 12 }}>Clienti</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: T.white, borderRadius: 11, border: `1.5px solid ${T.line}`, padding: '10px 13px', marginBottom: 12 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca per nome o telefono…" style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: T.ink, fontFamily: 'inherit' }} />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: T.inkSoft }}>✕</button>}
        </div>
        <p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{results.length} clienti</p>
      </div>

      <div style={{ padding: '0 16px' }}>
        {results.map((c, i) => (
          <div key={c.id}>
            <div onClick={() => onNav('pro_cliente', c)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', cursor: 'pointer' }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: T.white, fontWeight: 700, flexShrink: 0 }}>
                {c.name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: '0 0 2px' }}>{c.name}</p>
                <p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{c.appts} appuntamenti · Ultimo: {c.lastVisit || '–'}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: T.ink, margin: '0 0 2px' }}>{c.totalSpent || 0}€</p>
                <p style={{ fontSize: 10, color: T.inkSoft, margin: 0 }}>totale</p>
              </div>
            </div>
            {i < results.length - 1 && <div style={{ height: 1, background: T.line }} />}
          </div>
        ))}
        {results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>👤</p>
            <p style={{ fontSize: 14, color: T.inkSoft }}>Nessun cliente trovato</p>
          </div>
        )}
      </div>
    </div>
  )
}
