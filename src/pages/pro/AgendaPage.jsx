import { useState, useMemo } from 'react'
import { T } from '../../styles/tokens'
import { APPTS0, CLIENTS0, SVCS0, DAYS, MONTHS, toMin, toTime, SLOTS } from '../../lib/constants'
import { Modal } from '../../components/ui/Modal'
import { BigBtn } from '../../components/ui/Button'

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8)

function today() { return new Date(2026, 5, 14) }

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }

const ST_COLOR = { confermato: T.green, 'in attesa': '#B45309', cancellato: '#D94040', completato: '#2563EB' }

export default function AgendaPage({ appts: extAppts, onAddAppt, onUpdateStatus, onDeleteAppt, onNav }) {
  const [appts, setAppts] = useState(extAppts || APPTS0)
  const [view, setView] = useState('day')
  const [selDay, setSelDay] = useState(today())
  const [showAdd, setShowAdd] = useState(false)
  const [showLastMin, setShowLastMin] = useState(false)
  const [form, setForm] = useState({ client: '', svc: '', date: '', time: '', note: '' })
  const [clientQ, setClientQ] = useState('')
  const [detail, setDetail] = useState(null)

  const weekStart = useMemo(() => {
    const d = new Date(selDay)
    d.setDate(d.getDate() - d.getDay() + 1)
    return d
  }, [selDay])

  const dayAppts = appts.filter(a => {
    const d = new Date(a.dateRaw || today())
    return sameDay(d, selDay)
  }).sort((a, b) => toMin(a.time) - toMin(b.time))

  const weekAppts = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i)
      return appts.filter(a => sameDay(new Date(a.dateRaw || today()), d))
    })
  }, [appts, weekStart])

  const addAppt = () => {
    if (!form.client || !form.svc || !form.time) return
    const svc = SVCS0.find(s => s.name === form.svc) || SVCS0[0]
    const newA = {
      id: Date.now(),
      client: form.client,
      service: form.svc,
      time: form.time,
      endTime: toTime(toMin(form.time) + (svc?.min || 30)),
      price: svc?.price || 0,
      status: 'confermato',
      dateRaw: selDay.toISOString(),
      note: form.note,
    }
    setAppts(p => [...p, newA])
    onAddAppt?.(newA)
    setShowAdd(false)
    setForm({ client: '', svc: '', date: '', time: '', note: '' })
    setClientQ('')
  }

  const updateStatus = (id, status) => {
    setAppts(p => p.map(a => a.id === id ? { ...a, status } : a))
    onUpdateStatus?.(id, status)
    setDetail(null)
  }

  const exportCSV = () => {
    const rows = [['Cliente', 'Servizio', 'Data', 'Ora', 'Prezzo', 'Stato'], ...appts.map(a => [a.client, a.service, a.date || '', a.time, a.price, a.status])]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'agenda.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const filteredClients = CLIENTS0.filter(c => c.name.toLowerCase().includes(clientQ.toLowerCase())).slice(0, 5)

  const todayRev = appts.filter(a => sameDay(new Date(a.dateRaw || today()), today()) && a.status !== 'cancellato').reduce((s, a) => s + (a.price || 0), 0)

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '50px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.ink, margin: 0 }}>Agenda</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowLastMin(true)} style={{ padding: '7px 11px', borderRadius: 9, border: `1.5px solid ${T.gold}`, background: T.goldBg, color: T.gold, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>⚡ Last min</button>
          <button onClick={exportCSV} style={{ padding: '7px 11px', borderRadius: 9, border: `1.5px solid ${T.line}`, background: T.white, color: T.inkMid, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>CSV</button>
        </div>
      </div>

      <div style={{ padding: '0 16px 10px', display: 'flex', gap: 0, borderBottom: `1px solid ${T.line}` }}>
        {[['day', 'Giorno'], ['week', 'Settimana']].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} style={{ flex: 1, paddingBottom: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: view === id ? 700 : 400, color: view === id ? T.ink : T.inkSoft, borderBottom: `2px solid ${view === id ? T.ink : 'transparent'}`, fontFamily: 'inherit' }}>{label}</button>
        ))}
      </div>

      {view === 'day' && (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '10px 16px' }}>
            {Array.from({ length: 14 }, (_, i) => addDays(today(), i - 3)).map((d, i) => {
              const sel = sameDay(d, selDay)
              const isToday = sameDay(d, today())
              return (
                <button key={i} onClick={() => setSelDay(d)} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 9px', borderRadius: 10, border: `1.5px solid ${sel ? T.ink : T.line}`, background: sel ? T.ink : T.white, cursor: 'pointer', minWidth: 46, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 9, color: sel ? T.gold : T.inkSoft, fontWeight: 600, marginBottom: 2 }}>{DAYS[d.getDay()]}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: sel ? T.white : isToday ? T.gold : T.ink }}>{d.getDate()}</span>
                </button>
              )
            })}
          </div>

          <div style={{ padding: '0 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 13, color: T.inkSoft, margin: 0 }}>{dayAppts.length} appuntamenti · {todayRev}€</p>
            <button onClick={() => setShowAdd(true)} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: T.ink, color: T.white, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Aggiungi</button>
          </div>

          <div style={{ position: 'relative', padding: '0 16px' }}>
            {HOURS.map(h => (
              <div key={h} style={{ display: 'flex', gap: 8, minHeight: 60 }}>
                <div style={{ width: 36, fontSize: 11, color: T.inkSoft, paddingTop: 4, flexShrink: 0 }}>{h}:00</div>
                <div style={{ flex: 1, borderTop: `1px solid ${T.line}`, position: 'relative' }}>
                  {dayAppts.filter(a => {
                    const m = toMin(a.time)
                    return m >= h * 60 && m < (h + 1) * 60
                  }).map(a => {
                    const top = ((toMin(a.time) % 60) / 60) * 60
                    const svc = SVCS0.find(s => s.name === a.service)
                    const height = Math.max(((svc?.min || 30) / 60) * 60, 28)
                    const col = ST_COLOR[a.status] || T.ink
                    return (
                      <div key={a.id} onClick={() => setDetail(a)} style={{ position: 'absolute', top, left: 0, right: 0, background: `${col}18`, border: `1.5px solid ${col}`, borderRadius: 7, padding: '3px 7px', cursor: 'pointer', height, boxSizing: 'border-box' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: col, margin: 0 }}>{a.time} {a.client}</p>
                        <p style={{ fontSize: 10, color: T.inkSoft, margin: 0 }}>{a.service}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'week' && (
        <div style={{ padding: '10px 16px' }}>
          <div style={{ display: 'flex', marginBottom: 8 }}>
            <div style={{ width: 36 }} />
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d, i) => {
              const sel = sameDay(d, selDay)
              return (
                <div key={i} onClick={() => { setSelDay(d); setView('day') }} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
                  <p style={{ fontSize: 9, color: T.inkSoft, margin: '0 0 2px' }}>{DAYS[d.getDay()]}</p>
                  <div style={{ width: 26, height: 26, borderRadius: 13, background: sel ? T.ink : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: sel ? T.white : T.ink, margin: 0 }}>{d.getDate()}</p>
                  </div>
                </div>
              )
            })}
          </div>
          {HOURS.map(h => (
            <div key={h} style={{ display: 'flex', minHeight: 44, borderTop: `1px solid ${T.line}` }}>
              <div style={{ width: 36, fontSize: 10, color: T.inkSoft, paddingTop: 2, flexShrink: 0 }}>{h}:00</div>
              {weekAppts.map((dayA, i) => {
                const slot = dayA.filter(a => { const m = toMin(a.time); return m >= h * 60 && m < (h + 1) * 60 })
                return (
                  <div key={i} style={{ flex: 1, borderLeft: `1px solid ${T.line}`, padding: '2px' }}>
                    {slot.map(a => (
                      <div key={a.id} onClick={() => { setSelDay(addDays(weekStart, i)); setView('day') }} style={{ background: T.ink, borderRadius: 3, padding: '2px 3px', marginBottom: 1, cursor: 'pointer' }}>
                        <p style={{ fontSize: 8, color: T.white, margin: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{a.client}</p>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {detail && (
        <Modal title="Dettaglio appuntamento" onClose={() => setDetail(null)}>
          {[['Cliente', detail.client], ['Servizio', detail.service], ['Orario', detail.time], ['Prezzo', `${detail.price}€`], ['Staff', detail.staff || '–'], ['Note', detail.note || '–']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ fontSize: 13, color: T.inkSoft }}>{k}</span>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => updateStatus(detail.id, 'completato')} style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', background: '#E8F8F0', color: '#1A9E5C', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Completato</button>
            <button onClick={() => updateStatus(detail.id, 'cancellato')} style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', background: '#FEF2F2', color: '#D94040', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Cancella</button>
          </div>
        </Modal>
      )}

      {showAdd && (
        <Modal title="Nuovo appuntamento" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .6 }}>Cliente</label>
              <input value={clientQ} onChange={e => { setClientQ(e.target.value); setForm(f => ({ ...f, client: e.target.value })) }} placeholder="Cerca cliente…" style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              {clientQ.length > 0 && filteredClients.length > 0 && (
                <div style={{ border: `1px solid ${T.line}`, borderRadius: 9, marginTop: 4, overflow: 'hidden' }}>
                  {filteredClients.map(c => (
                    <div key={c.id} onClick={() => { setForm(f => ({ ...f, client: c.name })); setClientQ(c.name) }} style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: T.ink, borderBottom: `1px solid ${T.line}` }}>{c.name}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .6 }}>Servizio</label>
              <select value={form.svc} onChange={e => setForm(f => ({ ...f, svc: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 14, fontFamily: 'inherit', outline: 'none', background: T.white }}>
                <option value="">Seleziona…</option>
                {SVCS0.map(s => <option key={s.id} value={s.name}>{s.name} – {s.price}€</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .6 }}>Orario</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SLOTS.slice(0, 12).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, time: t }))} style={{ padding: '7px 11px', borderRadius: 8, border: `1.5px solid ${form.time === t ? T.ink : T.line}`, background: form.time === t ? T.ink : T.white, color: form.time === t ? T.white : T.ink, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .6 }}>Note</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Note opzionali…" style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none', minHeight: 60, boxSizing: 'border-box' }} />
            </div>
            <BigBtn label="Aggiungi appuntamento" disabled={!form.client || !form.svc || !form.time} onClick={addAppt} />
          </div>
        </Modal>
      )}

      {showLastMin && (
        <Modal title="⚡ Slot last minute" onClose={() => setShowLastMin(false)}>
          <p style={{ fontSize: 13, color: T.inkMid, marginBottom: 14 }}>Invia una notifica push ai tuoi clienti per gli slot disponibili oggi:</p>
          <div style={{ background: T.surface, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            {SLOTS.filter((_, i) => i % 4 === 0).slice(0, 6).map(t => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${T.line}` }}>
                <span style={{ fontSize: 13, color: T.ink }}>Oggi {t}</span>
                <span style={{ fontSize: 11, color: T.green }}>Disponibile</span>
              </div>
            ))}
          </div>
          <BigBtn label="📣 Invia notifica ai follower" onClick={() => setShowLastMin(false)} />
        </Modal>
      )}
    </div>
  )
}
