import { useState } from 'react'
import { T } from '../../styles/tokens'
import { useAuth } from '../../hooks/useAuth'

const iS = { padding: '12px 13px', borderRadius: 10, border: `1.5px solid #EBEBEB`, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#0A0A0A', width: '100%', boxSizing: 'border-box' }

export default function LoginPage({ onDemoAuth }) {
  const { signIn, signUp } = useAuth()
  const [tp, setTp] = useState(null)
  const [authMode, setAuthMode] = useState(null) // null | 'login' | 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [type, setType] = useState('cliente')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDemoEnter = () => {
    if (!tp) return
    onDemoAuth({ name: tp === 'pro' ? 'Salon Élite' : 'Alessio', type: tp })
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (authMode === 'login') {
        await signIn({ email, password })
      } else {
        await signUp({ name, email, password, type })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (authMode) return (
    <div style={{ minHeight: '100dvh', padding: '52px 24px 40px', background: T.white, display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto' }}>
      <button onClick={() => setAuthMode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.inkSoft, padding: '0 0 20px 0', fontFamily: 'inherit', textAlign: 'left' }}>← Indietro</button>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 20 }}>✂️</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{authMode === 'login' ? 'Accedi' : 'Crea account'}</h1>
      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {authMode === 'register' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
              {[{ id: 'cliente', e: '🛋️', l: 'Cliente' }, { id: 'pro', e: '💼', l: 'Professionista' }].map(opt => (
                <div key={opt.id} onClick={() => setType(opt.id)} style={{ flex: 1, border: `2px solid ${type === opt.id ? T.ink : T.line}`, borderRadius: 12, padding: 12, cursor: 'pointer', background: type === opt.id ? T.surface : T.white, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 3 }}>{opt.e}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{opt.l}</div>
                </div>
              ))}
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" required style={iS} />
          </>
        )}
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required style={iS} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min. 6 caratteri)" required minLength={6} style={iS} />
        {error && <p style={{ fontSize: 12, color: T.red, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ padding: '14px 0', borderRadius: 12, border: 'none', background: T.ink, color: T.white, fontSize: 15, fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit', marginTop: 4 }}>
          {loading ? 'Caricamento...' : authMode === 'login' ? 'Accedi' : 'Registrati'}
        </button>
      </form>
      <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{ marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.inkMid, fontFamily: 'inherit' }}>
        {authMode === 'login' ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi'}
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', padding: '52px 26px 40px', background: T.white, display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 24 }}>✂️</div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: T.ink, lineHeight: 1.1, marginBottom: 6 }}>La bellezza a portata di mano.</h1>
      <p style={{ fontSize: 14, color: T.inkMid, marginBottom: 28 }}>Scegli come accedere per la demo:</p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[{ id: 'pro', emoji: '💼', title: 'Professionista', desc: 'Agenda, clienti, servizi, statistiche' },
          { id: 'cliente', emoji: '🛋️', title: 'Cliente', desc: 'Cerca, esplora, prenota, recensisci' }].map(opt => (
          <div key={opt.id} onClick={() => setTp(opt.id)} style={{ border: `2px solid ${tp === opt.id ? T.ink : T.line}`, borderRadius: 16, padding: '16px', cursor: 'pointer', background: tp === opt.id ? T.surface : T.white }}>
            <div style={{ display: 'flex', gap: 12 }}><span style={{ fontSize: 24 }}>{opt.emoji}</span><div><p style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: '0 0 3px' }}>{opt.title}</p><p style={{ fontSize: 13, color: T.inkMid, margin: 0 }}>{opt.desc}</p></div></div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <button onClick={handleDemoEnter} disabled={!tp} style={{ width: '100%', padding: '15px 0', borderRadius: 13, border: 'none', cursor: tp ? 'pointer' : 'default', fontSize: 15, fontWeight: 600, background: T.ink, color: T.white, opacity: tp ? 1 : 0.35, fontFamily: 'inherit' }}>Entra nell'app</button>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={() => setAuthMode('login')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.inkSoft, fontFamily: 'inherit' }}>Accedi con email</button>
        <span style={{ color: T.line }}>·</span>
        <button onClick={() => setAuthMode('register')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.inkSoft, fontFamily: 'inherit' }}>Registrati</button>
      </div>
    </div>
  )
}
