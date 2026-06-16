import { useState } from 'react'
import { T } from '../../styles/tokens'
import { SVCS0, STAFF0, HOURS0 } from '../../lib/constants'
import { Modal } from '../../components/ui/Modal'
import { BigBtn } from '../../components/ui/Button'

const DAYS_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function ServiziPage() {
  const [tab, setTab] = useState('servizi')
  const [svcs, setSvcs] = useState(SVCS0)
  const [staff, setStaff] = useState(STAFF0)
  const [hours, setHours] = useState(HOURS0)
  const [showAddSvc, setShowAddSvc] = useState(false)
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [editSvc, setEditSvc] = useState(null)
  const [svcForm, setSvcForm] = useState({ name: '', price: '', min: '' })
  const [staffForm, setStaffForm] = useState({ name: '', role: '' })

  const saveSvc = () => {
    if (!svcForm.name || !svcForm.price || !svcForm.min) return
    if (editSvc) {
      setSvcs(p => p.map(s => s.id === editSvc.id ? { ...s, ...svcForm, price: +svcForm.price, min: +svcForm.min } : s))
    } else {
      setSvcs(p => [...p, { id: Date.now(), ...svcForm, price: +svcForm.price, min: +svcForm.min }])
    }
    setShowAddSvc(false); setEditSvc(null); setSvcForm({ name: '', price: '', min: '' })
  }

  const deleteSvc = (id) => setSvcs(p => p.filter(s => s.id !== id))

  const saveStaff = () => {
    if (!staffForm.name) return
    setStaff(p => [...p, { id: Date.now(), ...staffForm }])
    setShowAddStaff(false); setStaffForm({ name: '', role: '' })
  }

  const toggleHour = (day, field) => setHours(p => p.map(h => h.day === day ? { ...h, [field]: !h[field] } : h))

  const iS = { width: '100%', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '50px 16px 0' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 12 }}>Gestione</h1>
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.line}` }}>
          {[['servizi', 'Servizi'], ['staff', 'Staff'], ['orari', 'Orari']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, paddingBottom: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === id ? 700 : 400, color: tab === id ? T.ink : T.inkSoft, borderBottom: `2px solid ${tab === id ? T.ink : 'transparent'}`, fontFamily: 'inherit' }}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'servizi' && (
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => { setEditSvc(null); setSvcForm({ name: '', price: '', min: '' }); setShowAddSvc(true) }} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: T.ink, color: T.white, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Aggiungi</button>
          </div>
          {svcs.map((s, i) => (
            <div key={s.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: '0 0 2px' }}>{s.name}</p>
                  <p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{s.min} min</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{s.price}€</span>
                  <button onClick={() => { setEditSvc(s); setSvcForm({ name: s.name, price: String(s.price), min: String(s.min) }); setShowAddSvc(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.inkSoft, padding: 0, fontFamily: 'inherit' }}>✏️</button>
                  <button onClick={() => deleteSvc(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#D94040', padding: 0 }}>✕</button>
                </div>
              </div>
              {i < svcs.length - 1 && <div style={{ height: 1, background: T.line }} />}
            </div>
          ))}
        </div>
      )}

      {tab === 'staff' && (
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setShowAddStaff(true)} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: T.ink, color: T.white, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Aggiungi</button>
          </div>
          {staff.map((m, i) => (
            <div key={m.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0' }}>
                <div style={{ width: 42, height: 42, borderRadius: 21, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, color: T.white, fontWeight: 700, flexShrink: 0 }}>{m.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: '0 0 1px' }}>{m.name}</p>
                  <p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{m.role}</p>
                </div>
                <button onClick={() => setStaff(p => p.filter(s => s.id !== m.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#D94040', padding: 0 }}>✕</button>
              </div>
              {i < staff.length - 1 && <div style={{ height: 1, background: T.line }} />}
            </div>
          ))}
        </div>
      )}

      {tab === 'orari' && (
        <div style={{ padding: '14px 16px 0' }}>
          {(hours || HOURS0).map((h, i) => (
            <div key={h.day} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div onClick={() => toggleHour(h.day, 'open')} style={{ width: 38, height: 22, borderRadius: 11, background: h.open ? T.ink : T.line, cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: h.open ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: T.white, transition: 'left .15s' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: h.open ? T.ink : T.inkSoft }}>{DAYS_IT[i]}</span>
              </div>
              {h.open && (
                <p style={{ fontSize: 12, color: T.inkMid, margin: 0 }}>{h.from} – {h.to}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddSvc && (
        <Modal title={editSvc ? 'Modifica servizio' : 'Nuovo servizio'} onClose={() => { setShowAddSvc(false); setEditSvc(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={svcForm.name} onChange={e => setSvcForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome servizio" style={iS} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" value={svcForm.price} onChange={e => setSvcForm(f => ({ ...f, price: e.target.value }))} placeholder="Prezzo (€)" style={{ ...iS, flex: 1 }} />
              <input type="number" value={svcForm.min} onChange={e => setSvcForm(f => ({ ...f, min: e.target.value }))} placeholder="Durata (min)" style={{ ...iS, flex: 1 }} />
            </div>
            <BigBtn label={editSvc ? 'Salva modifiche' : 'Aggiungi servizio'} disabled={!svcForm.name || !svcForm.price || !svcForm.min} onClick={saveSvc} />
          </div>
        </Modal>
      )}

      {showAddStaff && (
        <Modal title="Nuovo membro staff" onClose={() => setShowAddStaff(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome" style={iS} />
            <input value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))} placeholder="Ruolo (es. Colorista)" style={iS} />
            <BigBtn label="Aggiungi" disabled={!staffForm.name} onClick={saveStaff} />
          </div>
        </Modal>
      )}
    </div>
  )
}
