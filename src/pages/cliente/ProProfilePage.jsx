import { useState } from 'react'
import { T } from '../../styles/tokens'
import { Modal } from '../../components/ui/Modal'
import { FEED } from '../../lib/constants'

const DivP = () => <div style={{ height: 1, background: '#EBEBEB', margin: '0 18px' }} />

function Photo({ src, style, onClick }) {
  const [err, setErr] = useState(false)
  if (err || !src) return <div onClick={onClick} style={{ background: 'linear-gradient(160deg,#C9A96E,#8B5E3C)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3" /></svg></div>
  return <img src={src} onError={() => setErr(true)} onClick={onClick} style={{ objectFit: 'cover', display: 'block', ...style }} alt="" />
}

function Stars({ n, set }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(i => <button key={i} onClick={() => set && set(i)} style={{ fontSize: 26, background: 'none', border: 'none', cursor: set ? 'pointer' : 'default', color: i <= n ? '#C9A96E' : '#D1D5DB', padding: 0 }}>{i <= n ? '★' : '☆'}</button>)}
    </div>
  )
}

const MY_FOLLOWED = new Set([1, 3])
const coverKw = { parrucchiere: 'hair salon interior', barbiere: 'barbershop interior', nail_artist: 'nail salon beauty', estetista: 'spa beauty', tatuatore: 'tattoo studio' }

export default function ProProfilePage({ pro, onNav }) {
  const [followed, setF] = useState(MY_FOLLOWED.has(pro.id))
  const [selSvc, setSvc] = useState(null)
  const [showRev, setShowRev] = useState(false)
  const [stars, setStars] = useState(5)
  const [revText, setRevText] = useState('')
  const [reviews, setReviews] = useState([
    { name: 'Marco T.', text: 'Risultato perfetto!', stars: 5, date: '10 giu 2026' },
    { name: 'Lucia F.', text: 'Professionale e puntuale.', stars: 5, date: '28 mag 2026' },
  ])
  const proPosts = FEED.filter(p => p.proId === pro.id)
  const kw = coverKw[pro.catId] || 'beauty salon'

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ position: 'relative', height: 170 }}>
        <Photo src={`https://source.unsplash.com/860x400/?${encodeURIComponent(kw)}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,.1),rgba(0,0,0,.5))' }} />
        <button onClick={() => onNav('cl_home')} style={{ position: 'absolute', top: 48, left: 14, width: 32, height: 32, borderRadius: 16, background: 'rgba(0,0,0,.4)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
        </button>
        <div style={{ position: 'absolute', bottom: -24, left: 16, width: 60, height: 60, borderRadius: '50%', border: `3px solid ${T.white}`, background: `${pro.accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 27, boxShadow: '0 2px 10px rgba(0,0,0,.2)' }}>{pro.emoji}</div>
      </div>

      <div style={{ padding: '30px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div><h1 style={{ fontSize: 19, fontWeight: 700, color: T.ink, margin: '0 0 2px' }}>{pro.name}</h1><p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>@{pro.handle} · {pro.city}</p></div>
          <button onClick={() => setF(f => !f)} style={{ padding: '7px 14px', borderRadius: 99, cursor: 'pointer', border: `1.5px solid ${followed ? T.gold : T.ink}`, background: followed ? T.goldBg : T.ink, color: followed ? T.gold : T.white, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}>{followed ? '✓ Seguito' : '+ Segui'}</button>
        </div>
        <p style={{ fontSize: 13, color: T.inkMid, lineHeight: 1.6, margin: '9px 0 10px' }}>{pro.bio}</p>
        <div style={{ display: 'flex', borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}`, padding: '10px 0', marginBottom: 11 }}>
          {[[proPosts.length, 'post'], [pro.followers, 'follower'], [pro.reviews, 'rec.'], [pro.rating, '★']].map(([v, l], i, arr) => (
            <div key={l} style={{ flex: 1, textAlign: 'center', borderRight: i < arr.length - 1 ? `1px solid ${T.line}` : 'none' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: 0 }}>{v}</p><p style={{ fontSize: 10, color: T.inkSoft, margin: 0 }}>{l}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={() => onNav('cl_prenota', { pro })} style={{ flex: 2, padding: '12px 0', borderRadius: 11, border: 'none', background: T.ink, color: T.white, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Prenota</button>
          <button onClick={() => setShowRev(true)} style={{ flex: 1, padding: '12px 0', borderRadius: 11, border: `1.5px solid ${T.line}`, background: T.white, color: T.inkMid, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>⭐ Recensisci</button>
        </div>
      </div>

      {proPosts.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>{proPosts.map(post => <div key={post.id} style={{ aspectRatio: '1', overflow: 'hidden' }}><Photo src={post.imgs[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>)}</div>}

      <div style={{ padding: '14px 16px 0' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Servizi</p>
        {pro.services.map((s, i) => {
          const act = selSvc?.id === s.id
          return (
            <div key={s.id}>
              <div onClick={() => setSvc(act ? null : s)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', cursor: 'pointer' }}>
                <div><p style={{ fontSize: 13, fontWeight: act ? 600 : 500, color: act ? T.ink : T.inkMid, margin: '0 0 1px' }}>{s.name}</p><p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{s.min} min</p></div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{s.price}€</span>
              </div>
              {act && (
                <div style={{ paddingBottom: 10 }}>
                  <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 7 }}>Tocca per scegliere data e orario:</p>
                  <button onClick={() => onNav('cl_prenota', { pro, service: s })} style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: T.ink, color: T.white, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Scegli data e orario →</button>
                </div>
              )}
              {i < pro.services.length - 1 && <DivP />}
            </div>
          )
        })}
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 10 }}>Recensioni ({reviews.length})</p>
        {reviews.map((r, i) => (
          <div key={i} style={{ marginBottom: 10, padding: '11px 12px', background: T.surface, borderRadius: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.ink, margin: 0 }}>{r.name}</p>
              <p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{r.date}</p>
            </div>
            <div style={{ color: T.gold, fontSize: 13, marginBottom: 4 }}>{'★'.repeat(r.stars)}</div>
            <p style={{ fontSize: 13, color: T.inkMid, margin: 0, lineHeight: 1.5 }}>{r.text}</p>
          </div>
        ))}
      </div>

      {showRev && (
        <Modal title={`Recensisci ${pro.name}`} onClose={() => setShowRev(false)}>
          <p style={{ fontSize: 13, color: T.inkMid, marginBottom: 12 }}>Come valuti la tua esperienza?</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><Stars n={stars} set={setStars} /></div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .7 }}>La tua recensione</label>
            <textarea value={revText} onChange={e => setRevText(e.target.value)} placeholder="Racconta la tua esperienza…" style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: `1.5px solid ${T.line}`, fontSize: 14, color: T.ink, fontFamily: 'inherit', outline: 'none', resize: 'none', minHeight: 80, boxSizing: 'border-box', lineHeight: 1.5 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowRev(false)} style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: `1.5px solid ${T.line}`, background: T.white, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: T.inkMid, fontFamily: 'inherit' }}>Annulla</button>
            <button onClick={() => { if (!revText) return; const now = new Date(); setReviews(p => [{ name: 'Tu', text: revText, stars, date: `${now.getDate()} giu 2026` }, ...p]); setShowRev(false); setRevText('') }} disabled={!revText} style={{ flex: 2, padding: '11px 0', borderRadius: 9, border: 'none', background: T.ink, color: T.white, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: !revText ? .4 : 1 }}>Pubblica</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
