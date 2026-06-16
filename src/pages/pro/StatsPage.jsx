import { T } from '../../styles/tokens'
import { APPTS0, SVCS0, STAFF0 } from '../../lib/constants'

function today() { return new Date(2026, 5, 14) }

function Bar({ label, val, max, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: T.inkMid }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{val}€</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: T.surface, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min((val / max) * 100, 100)}%`, background: color || T.ink, borderRadius: 4, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

export default function StatsPage() {
  const confirmed = APPTS0.filter(a => a.status !== 'cancellato')
  const todayAppts = confirmed.filter(a => {
    const d = new Date(a.dateRaw || today())
    const t = today()
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
  })

  const todayRev = todayAppts.reduce((s, a) => s + (a.price || 0), 0)
  const monthRev = confirmed.reduce((s, a) => s + (a.price || 0), 0)
  const avgTicket = confirmed.length ? Math.round(monthRev / confirmed.length) : 0

  const svcRevMap = {}
  confirmed.forEach(a => { svcRevMap[a.service] = (svcRevMap[a.service] || 0) + (a.price || 0) })
  const topSvcs = Object.entries(svcRevMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxSvc = topSvcs[0]?.[1] || 1

  const staffRevMap = {}
  confirmed.forEach(a => { if (a.staff) staffRevMap[a.staff] = (staffRevMap[a.staff] || 0) + (a.price || 0) })
  const topStaff = Object.entries(staffRevMap).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const maxStaff = topStaff[0]?.[1] || 1

  const newClients = 4
  const returningClients = confirmed.length - newClients

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '50px 16px 14px', borderBottom: `1px solid ${T.line}` }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.ink, margin: '0 0 14px' }}>Statistiche</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          {[['Oggi', `${todayRev}€`, T.greenBg, T.green], ['Mese', `${monthRev}€`, T.goldBg, T.gold], ['Ticket medio', `${avgTicket}€`, T.surface, T.inkMid]].map(([l, v, bg, col]) => (
            <div key={l} style={{ flex: 1, background: bg, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: col, margin: '0 0 2px' }}>{v}</p>
              <p style={{ fontSize: 10, color: T.inkSoft, margin: 0 }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {[['📅', todayAppts.length, 'Oggi'], ['📊', confirmed.length, 'Mese'], ['👥', newClients, 'Nuovi'], ['🔁', returningClients, 'Ritorno']].map(([e, v, l]) => (
            <div key={l} style={{ flex: 1, background: T.surface, borderRadius: 11, padding: '11px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 11, margin: '0 0 2px' }}>{e}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: T.ink, margin: '0 0 1px' }}>{v}</p>
              <p style={{ fontSize: 10, color: T.inkSoft, margin: 0 }}>{l}</p>
            </div>
          ))}
        </div>

        {topSvcs.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Top servizi</p>
            {topSvcs.map(([name, rev]) => <Bar key={name} label={name} val={rev} max={maxSvc} color={T.ink} />)}
          </div>
        )}

        {topStaff.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Top staff</p>
            {topStaff.map(([name, rev]) => <Bar key={name} label={name} val={rev} max={maxStaff} color={T.gold} />)}
          </div>
        )}

        <div style={{ background: T.surface, borderRadius: 13, padding: '14px', marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Ripartizione clienti</p>
          <div style={{ display: 'flex', gap: 0, height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ flex: newClients, background: T.ink }} />
            <div style={{ flex: returningClients, background: T.gold }} />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: T.ink }} /><span style={{ fontSize: 11, color: T.inkSoft }}>Nuovi ({newClients})</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: T.gold }} /><span style={{ fontSize: 11, color: T.inkSoft }}>Ritorno ({returningClients})</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
