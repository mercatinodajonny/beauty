import { useState } from 'react'
import { T } from '../../styles/tokens'
import { APPTS0 } from '../../lib/constants'
import { BigBtn } from '../../components/ui/Button'

export default function ClienteDetailPage({ client, onNav }) {
  const [note, setNote] = useState(client?.note || '')
  const [editNote, setEditNote] = useState(false)
  const appts = APPTS0.filter(a => a.client === client?.name)

  if (!client) return null

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '50px 16px 14px', borderBottom: `1px solid ${T.line}` }}>
        <button onClick={() => onNav('pro_clienti')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.inkSoft, padding: '0 0 12px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>Clienti
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 60, height: 60, borderRadius: 30, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: T.white, fontWeight: 700 }}>
            {client.name[0].toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: T.ink, margin: '0 0 2px' }}>{client.name}</h1>
            <p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>{client.phone || '–'} · {client.email || '–'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, marginTop: 14, borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
          {[[client.appts || 0, 'appuntamenti'], [client.totalSpent || 0, '€ totale'], [client.rating || '–', '★ media']].map(([v, l], i, arr) => (
            <div key={l} style={{ flex: 1, textAlign: 'center', borderRight: i < arr.length - 1 ? `1px solid ${T.line}` : 'none' }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: T.ink, margin: 0 }}>{v}</p>
              <p style={{ fontSize: 10, color: T.inkSoft, margin: 0 }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, margin: 0 }}>Note private</p>
          <button onClick={() => setEditNote(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.inkSoft, fontFamily: 'inherit' }}>{editNote ? 'Chiudi' : 'Modifica'}</button>
        </div>
        {editNote ? (
          <div>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Aggiungi note sul cliente…" style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none', minHeight: 80, boxSizing: 'border-box', lineHeight: 1.5 }} />
            <button onClick={() => setEditNote(false)} style={{ marginTop: 6, padding: '9px 0', width: '100%', borderRadius: 9, border: 'none', background: T.ink, color: T.white, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Salva nota</button>
          </div>
        ) : (
          <div style={{ background: T.surface, borderRadius: 10, padding: '11px 13px', minHeight: 50 }}>
            <p style={{ fontSize: 13, color: note ? T.ink : T.inkSoft, margin: 0, lineHeight: 1.5 }}>{note || 'Nessuna nota'}</p>
          </div>
        )}
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Storico appuntamenti ({appts.length})</p>
        {appts.length === 0 && <p style={{ fontSize: 13, color: T.inkSoft }}>Nessun appuntamento trovato.</p>}
        {appts.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${T.line}` }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.ink, margin: '0 0 2px' }}>{a.service}</p>
              <p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{a.date || '–'} · {a.time}</p>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{a.price}€</span>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <BigBtn label="+ Nuovo appuntamento" onClick={() => onNav('pro_agenda')} />
      </div>
    </div>
  )
}
