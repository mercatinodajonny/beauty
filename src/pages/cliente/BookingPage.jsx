import { useState } from 'react'
import { T } from '../../styles/tokens'
import { BigBtn } from '../../components/ui/Button'

const Div = () => <div style={{ height: 1, background: T.line }} />

const TIMES = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30']

export default function BookingPage({ data, onNav }) {
  const { pro, service: preselSvc, preselSlot } = data
  const [svc, setSvc] = useState(preselSvc || pro.services[0])
  const [selDate, setSelDate] = useState(null)
  const [selTime, setSelTime] = useState(preselSlot || null)
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)

  const today = new Date(2026, 5, 14)
  const DATES = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i)
    const DN = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
    const MN = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
    return { label: i === 0 ? 'Oggi' : i === 1 ? 'Domani' : `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`, day: d.getDate(), dayName: DN[d.getDay()] }
  })

  if (done) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 26px', background: T.white, textAlign: 'center' }}>
      <div style={{ width: 68, height: 68, borderRadius: 34, background: T.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 16 }}>✓</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 7 }}>Prenotazione confermata!</h1>
      <p style={{ fontSize: 13, color: T.inkMid, marginBottom: 22, lineHeight: 1.6 }}>{svc.name}<br /><strong>{pro.name}</strong><br />{selDate?.label} alle {selTime}</p>
      <div style={{ width: '100%', background: T.surface, borderRadius: 13, padding: '14px', marginBottom: 16, textAlign: 'left' }}>
        {[['Servizio', svc.name], ['Giorno', selDate?.label], ['Orario', selTime], ['Durata', `${svc.min} min`], ['Totale', `${svc.price}€`]].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.line}` }}><span style={{ fontSize: 12, color: T.inkSoft }}>{k}</span><span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{v}</span></div>
        ))}
      </div>
      <BigBtn label="Vedi appuntamenti" onClick={() => onNav('cl_appts')} />
      <button onClick={() => onNav('cl_pro', pro)} style={{ marginTop: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.inkSoft, padding: '9px 0', fontFamily: 'inherit' }}>Torna al profilo</button>
    </div>
  )

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '48px 18px 12px' }}>
        <button onClick={() => step === 1 ? onNav('cl_pro', pro) : setStep(s => s - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', display: 'inline-flex', alignItems: 'center', gap: 6, color: T.ink, fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>Indietro
        </button>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: T.ink, margin: '10px 0 10px' }}>Prenota da {pro.name}</h1>
        <div style={{ display: 'flex', gap: 5 }}>
          {['Servizio', 'Data & ora', 'Conferma'].map((l, i) => (
            <div key={l} style={{ flex: 1 }}>
              <div style={{ height: 3, borderRadius: 2, background: step > i ? T.ink : T.line, marginBottom: 3 }} />
              <p style={{ fontSize: 9, color: step > i ? T.ink : T.inkSoft, margin: 0, fontWeight: step === i + 1 ? 700 : 400 }}>{l}</p>
            </div>
          ))}
        </div>
      </div>
      <Div />

      {step === 1 && (
        <div style={{ padding: '12px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: .7, marginBottom: 10 }}>Scegli servizio</p>
          {pro.services.map((s, i) => (
            <div key={s.id}>
              <div onClick={() => setSvc(s)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 19, height: 19, borderRadius: 10, border: `2px solid ${svc.id === s.id ? T.ink : T.line}`, background: svc.id === s.id ? T.ink : T.white, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{svc.id === s.id && <div style={{ width: 7, height: 7, borderRadius: 4, background: T.white }} />}</div>
                  <div><p style={{ fontSize: 14, fontWeight: svc.id === s.id ? 600 : 400, color: T.ink, margin: '0 0 1px' }}>{s.name}</p><p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{s.min} min</p></div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{s.price}€</span>
              </div>
              {i < pro.services.length - 1 && <Div />}
            </div>
          ))}
          <div style={{ marginTop: 14 }}><BigBtn label="Continua →" onClick={() => setStep(2)} /></div>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: '12px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: .7, marginBottom: 10 }}>Scegli il giorno</p>
          <div style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 18, paddingBottom: 2 }}>
            {DATES.map((d, i) => {
              const sel = selDate?.label === d.label
              return (
                <button key={i} onClick={() => { setSelDate(d); setSelTime(null) }} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '9px 10px', borderRadius: 11, border: `1.5px solid ${sel ? T.ink : T.line}`, background: sel ? T.ink : T.white, cursor: 'pointer', minWidth: 54, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 9, color: sel ? T.gold : T.inkSoft, fontWeight: 600, marginBottom: 3 }}>{d.dayName}</span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: sel ? T.white : T.ink }}>{d.day}</span>
                </button>
              )
            })}
          </div>
          {selDate && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: .7, marginBottom: 10 }}>Scegli l'orario</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
                {TIMES.map(t => (
                  <button key={t} onClick={() => setSelTime(t)} style={{ padding: '8px 13px', borderRadius: 9, border: `1.5px solid ${selTime === t ? T.ink : T.line}`, background: selTime === t ? T.ink : T.white, cursor: 'pointer', fontSize: 13, fontWeight: selTime === t ? 700 : 400, color: selTime === t ? T.white : T.ink, fontFamily: 'inherit' }}>{t}</button>
                ))}
              </div>
            </>
          )}
          {selDate && selTime && (
            <div style={{ padding: '10px 12px', background: T.greenBg, borderRadius: 9, marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: T.green, margin: 0, fontWeight: 600 }}>✓ {selDate.label} alle {selTime} · {svc.name} · {svc.price}€</p>
            </div>
          )}
          <BigBtn label="Continua →" disabled={!selDate || !selTime} onClick={() => setStep(3)} />
        </div>
      )}

      {step === 3 && (
        <div style={{ padding: '12px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: .7, marginBottom: 10 }}>Riepilogo</p>
          <div style={{ background: T.surface, borderRadius: 13, padding: '2px 0', marginBottom: 14 }}>
            {[['Professionista', pro.name], ['Servizio', svc.name], ['Giorno', selDate?.label], ['Orario', selTime], ['Durata', `${svc.min} min`]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${T.line}` }}><span style={{ fontSize: 13, color: T.inkSoft }}>{k}</span><span style={{ fontSize: 13, color: T.ink, fontWeight: 500 }}>{v}</span></div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px' }}><span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Totale</span><span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{svc.price}€</span></div>
          </div>
          <div style={{ padding: '10px 12px', background: T.amberBg, borderRadius: 9, marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: T.amber, margin: 0 }}>🔔 Promemoria 1 ora prima</p>
          </div>
          <BigBtn label="✓ Conferma prenotazione" onClick={() => setDone(true)} />
          <button onClick={() => setStep(2)} style={{ width: '100%', marginTop: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.inkSoft, padding: '9px 0', fontFamily: 'inherit' }}>← Modifica data e orario</button>
        </div>
      )}
    </div>
  )
}
