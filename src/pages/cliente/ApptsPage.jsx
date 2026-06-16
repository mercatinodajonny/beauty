import { useState } from 'react'
import { T } from '../../styles/tokens'
import { MY_APPTS_CL } from '../../lib/constants'
import { Modal } from '../../components/ui/Modal'
import { BigBtn } from '../../components/ui/Button'

const TIMES = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30']

const ST_MAP = {
  confermato: { bg: '#E8F8F0', text: '#1A9E5C' },
  'in attesa': { bg: '#FBF5EC', text: '#B45309' },
  cancellato: { bg: '#FEF2F2', text: '#D94040' },
  completato: { bg: '#EFF6FF', text: '#2563EB' },
}

export default function ApptsPage({ onNav }) {
  const [appts, setAppts] = useState(MY_APPTS_CL)
  const [spostaId, setSpostaId] = useState(null)
  const [newTime, setNewTime] = useState(null)
  const [tab, setTab] = useState('upcoming')

  const upcoming = appts.filter(a => a.status !== 'cancellato' && a.status !== 'completato')
  const past = appts.filter(a => a.status === 'cancellato' || a.status === 'completato')
  const shown = tab === 'upcoming' ? upcoming : past

  const cancel = (id) => setAppts(p => p.map(a => a.id === id ? { ...a, status: 'cancellato' } : a))
  const reschedule = () => {
    if (!newTime) return
    setAppts(p => p.map(a => a.id === spostaId ? { ...a, time: newTime } : a))
    setSpostaId(null)
    setNewTime(null)
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '54px 18px 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 14 }}>I miei appuntamenti</h1>
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.line}`, marginBottom: 16 }}>
          {[['upcoming', 'Prossimi'], ['past', 'Passati']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, paddingBottom: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === id ? 700 : 400, color: tab === id ? T.ink : T.inkSoft, borderBottom: `2px solid ${tab === id ? T.ink : 'transparent'}`, fontFamily: 'inherit' }}>{label}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <p style={{ fontSize: 36, marginBottom: 10 }}>📅</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: T.ink, marginBottom: 6 }}>Nessun appuntamento</p>
          <p style={{ fontSize: 13, color: T.inkSoft, marginBottom: 20 }}>{tab === 'upcoming' ? 'Prenota il tuo prossimo servizio!' : 'I tuoi appuntamenti passati appariranno qui.'}</p>
          {tab === 'upcoming' && <BigBtn label="Esplora professionisti" onClick={() => onNav('cl_explore')} />}
        </div>
      )}

      <div style={{ padding: '0 18px' }}>
        {shown.map((a, i) => {
          const st = ST_MAP[a.status] || ST_MAP['in attesa']
          return (
            <div key={a.id} style={{ background: T.surface, borderRadius: 14, padding: '14px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: '0 0 2px' }}>{a.service}</p>
                  <p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>{a.pro}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 99, background: st.bg, color: st.text }}>{a.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: T.inkMid }}>📅 {a.date}</span>
                <span style={{ fontSize: 12, color: T.inkMid }}>🕐 {a.time}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginLeft: 'auto' }}>{a.price}€</span>
              </div>
              {a.status === 'confermato' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setSpostaId(a.id); setNewTime(null) }} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: `1.5px solid ${T.line}`, background: T.white, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: T.inkMid, fontFamily: 'inherit' }}>Sposta</button>
                  <button onClick={() => cancel(a.id)} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: `1.5px solid #FEE2E2`, background: '#FEF2F2', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#D94040', fontFamily: 'inherit' }}>Cancella</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {spostaId && (
        <Modal title="Sposta appuntamento" onClose={() => setSpostaId(null)}>
          <p style={{ fontSize: 13, color: T.inkMid, marginBottom: 12 }}>Scegli il nuovo orario:</p>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
            {TIMES.map(t => (
              <button key={t} onClick={() => setNewTime(t)} style={{ padding: '8px 13px', borderRadius: 9, border: `1.5px solid ${newTime === t ? T.ink : T.line}`, background: newTime === t ? T.ink : T.white, cursor: 'pointer', fontSize: 13, fontWeight: newTime === t ? 700 : 400, color: newTime === t ? T.white : T.ink, fontFamily: 'inherit' }}>{t}</button>
            ))}
          </div>
          <BigBtn label="Conferma spostamento" disabled={!newTime} onClick={reschedule} />
        </Modal>
      )}
    </div>
  )
}
