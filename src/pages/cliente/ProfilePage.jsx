import { useState } from 'react'
import { T } from '../../styles/tokens'
import { useAuth } from '../../hooks/useAuth'
import { BigBtn } from '../../components/ui/Button'

export default function ProfilePage({ onNav, user }) {
  const { signOut } = useAuth()
  const [tab, setTab] = useState('info')

  const handleSignOut = async () => {
    await signOut()
    onNav('login')
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '54px 18px 14px', borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: T.white, fontWeight: 700 }}>
            {(user?.name || 'A')[0].toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: T.ink, margin: '0 0 2px' }}>{user?.name || 'Alessio'}</h1>
            <p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>{user?.email || 'alessio@example.com'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.line}` }}>
          {[['info', 'Info'], ['notifiche', 'Notifiche'], ['sicurezza', 'Sicurezza']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, paddingBottom: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: tab === id ? 700 : 400, color: tab === id ? T.ink : T.inkSoft, borderBottom: `2px solid ${tab === id ? T.ink : 'transparent'}`, fontFamily: 'inherit' }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 18px 0' }}>
        {tab === 'info' && (
          <div>
            {[['Nome', user?.name || 'Alessio'], ['Email', user?.email || 'alessio@example.com'], ['Città', 'Milano'], ['Telefono', '+39 333 123 4567']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${T.line}` }}>
                <span style={{ fontSize: 13, color: T.inkSoft }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <BigBtn label="Modifica profilo" onClick={() => {}} />
            </div>
          </div>
        )}

        {tab === 'notifiche' && (
          <div>
            {[['Promemoria appuntamenti', true], ['Offerte speciali', true], ['Nuovi post seguiti', false], ['Novità BeautyApp', true]].map(([label, def], i) => {
              const [on, setOn] = useState(def)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: `1px solid ${T.line}` }}>
                  <span style={{ fontSize: 13, color: T.ink }}>{label}</span>
                  <div onClick={() => setOn(v => !v)} style={{ width: 44, height: 26, borderRadius: 13, background: on ? T.ink : T.line, cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 10, background: T.white, transition: 'left .2s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'sicurezza' && (
          <div>
            <div style={{ padding: '13px 0', borderBottom: `1px solid ${T.line}` }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.ink, margin: '0 0 4px' }}>Password</p>
              <p style={{ fontSize: 12, color: T.inkSoft, margin: '0 0 10px' }}>Cambia la tua password di accesso</p>
              <button style={{ padding: '9px 16px', borderRadius: 9, border: `1.5px solid ${T.line}`, background: T.white, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: T.ink, fontFamily: 'inherit' }}>Cambia password</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          <button onClick={handleSignOut} style={{ width: '100%', padding: '13px 0', borderRadius: 11, border: `1.5px solid #FEE2E2`, background: '#FEF2F2', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#D94040', fontFamily: 'inherit' }}>Esci dall'account</button>
        </div>
      </div>
    </div>
  )
}
