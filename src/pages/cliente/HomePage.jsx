import { useState } from 'react'
import { T } from '../../styles/tokens'
import { Avatar } from '../../components/ui/Avatar'
import { ALL_PROS, MY_APPTS_CL, MY_FOLLOWED_IDS } from '../../lib/constants'

const Div = () => <div style={{ height: 1, background: T.line }} />

const CATS = [
  { id: 'tutti', e: '✦', l: 'Tutti' },
  { id: 'parrucchiere', e: '✂️', l: 'Capelli' },
  { id: 'barbiere', e: '🪒', l: 'Barba' },
  { id: 'nail_artist', e: '💅', l: 'Nail' },
  { id: 'estetista', e: '🌿', l: 'Estetica' },
  { id: 'tatuatore', e: '🎨', l: 'Tattoo' },
]

export default function HomePage({ onNav, user }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('tutti')
  const [searching, setSearching] = useState(false)

  const next = MY_APPTS_CL[0]
  const followed = ALL_PROS.filter(p => (MY_FOLLOWED_IDS || new Set([1, 3])).has(p.id))
  const nearby = ALL_PROS.filter(p => p.city === 'Milano')

  const results = ALL_PROS.filter(p =>
    (cat === 'tutti' || p.catId === cat) &&
    (q.length < 2 || p.name.toLowerCase().includes(q.toLowerCase()) || p.city.toLowerCase().includes(q.toLowerCase()) || p.cat.toLowerCase().includes(q.toLowerCase()))
  )

  const isSearching = searching || q.length >= 2 || cat !== 'tutti'

  const ST_MAP = { confermato: { bg: '#E8F8F0', text: '#1A9E5C' }, 'in attesa': { bg: '#FBF5EC', text: '#B45309' }, cancellato: { bg: '#FEF2F2', text: '#D94040' }, completato: { bg: '#EFF6FF', text: '#2563EB' } }

  return (
    <div style={{ paddingBottom: 90, background: T.white }}>
      <div style={{ padding: '54px 18px 14px' }}>
        <p style={{ fontSize: 13, color: T.inkSoft, margin: '0 0 3px' }}>Buongiorno 👋</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: T.ink, margin: '0 0 14px' }}>Ciao, {user?.name || 'Alessio'}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: T.white, borderRadius: 13, border: `1.5px solid ${T.line}`, padding: '11px 13px', boxShadow: '0 3px 14px rgba(0,0,0,.07)', marginBottom: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input value={q} onChange={e => { setQ(e.target.value); setSearching(true) }} onFocus={() => setSearching(true)} placeholder="Cerca parrucchiere, città, categoria…" style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: T.ink, fontFamily: 'inherit' }} />
          {(q || cat !== 'tutti') && <button onClick={() => { setQ(''); setCat('tutti'); setSearching(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: T.inkSoft }}>✕</button>}
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
          {CATS.map(c => (
            <button key={c.id} onClick={() => { setCat(c.id); setSearching(true) }} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: cat === c.id ? T.ink : T.surface, color: cat === c.id ? T.white : T.inkMid, fontFamily: 'inherit' }}>{c.e} {c.l}</button>
          ))}
        </div>
      </div>

      {isSearching ? (
        <div style={{ padding: '0 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>{results.length} risultati</p>
            <button onClick={() => { setSearching(false); setQ(''); setCat('tutti') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.inkMid, fontFamily: 'inherit' }}>✕ Chiudi</button>
          </div>
          {results.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0' }}><p style={{ fontSize: 32, marginBottom: 8 }}>🔍</p><p style={{ fontSize: 14, color: T.inkSoft }}>Nessun risultato</p></div>}
          {results.map((pro, i) => (
            <div key={pro.id}>
              <div onClick={() => onNav('cl_pro', pro)} style={{ display: 'flex', gap: 12, padding: '13px 0', cursor: 'pointer', alignItems: 'center' }}>
                <Avatar pro={pro} size={50} fs={22} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: 0 }}>{pro.name}</p>
                    {pro.verified && <svg width="12" height="12" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill={T.green} /><path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>}
                  </div>
                  <p style={{ fontSize: 11, color: T.inkSoft, margin: '0 0 4px' }}>{pro.cat} · {pro.city}</p>
                  <span style={{ color: T.gold, fontSize: 12 }}>{'★'.repeat(Math.floor(pro.rating))}</span><span style={{ fontSize: 11, color: T.inkSoft }}> {pro.rating} ({pro.reviews})</span>
                </div>
                <button onClick={e => { e.stopPropagation(); onNav('cl_prenota', { pro }) }} style={{ padding: '7px 12px', borderRadius: 9, border: 'none', background: T.ink, color: T.white, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Prenota</button>
              </div>
              {i < results.length - 1 && <Div />}
            </div>
          ))}
        </div>
      ) : (
        <>
          {next && (
            <div style={{ margin: '0 18px 22px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Prossimo appuntamento</p>
              <div onClick={() => onNav('cl_appts')} style={{ background: T.ink, borderRadius: 16, padding: '16px', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -18, right: -18, width: 70, height: 70, borderRadius: '50%', background: 'rgba(201,169,110,.1)' }} />
                <p style={{ color: T.gold, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .8, margin: '0 0 4px' }}>{next.date} · {next.time}</p>
                <p style={{ color: T.white, fontSize: 19, fontWeight: 700, margin: '0 0 2px' }}>{next.service}</p>
                <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, margin: '0 0 13px' }}>{next.pro}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: T.white, fontSize: 17, fontWeight: 700 }}>{next.price}€</span>
                  <span style={{ padding: '6px 12px', borderRadius: 8, background: T.gold, color: T.ink, fontSize: 12, fontWeight: 600 }}>Dettagli</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 18px', marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: 0 }}>📍 Nella tua zona</p>
              <span onClick={() => setSearching(true)} style={{ fontSize: 12, color: T.inkSoft, cursor: 'pointer' }}>Vedi tutti</span>
            </div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 18px 4px' }}>
              {nearby.map(pro => (
                <div key={pro.id} onClick={() => onNav('cl_pro', pro)} style={{ flexShrink: 0, width: 142, borderRadius: 13, overflow: 'hidden', border: `1px solid ${T.line}`, cursor: 'pointer', background: T.white }}>
                  <div style={{ height: 82, background: `linear-gradient(135deg,${pro.accent}33,${pro.accent}11)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>{pro.emoji}</div>
                  <div style={{ padding: '9px 10px 11px' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pro.name}</p>
                    <p style={{ fontSize: 11, color: T.inkSoft, margin: '0 0 6px' }}>{pro.cat}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ color: T.gold, fontSize: 11 }}>★ {pro.rating}</span>
                      <button onClick={e => { e.stopPropagation(); onNav('cl_prenota', { pro }) }} style={{ padding: '4px 8px', borderRadius: 7, border: 'none', background: T.ink, color: T.white, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Prenota</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '0 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: 0 }}>❤️ Seguiti</p>
              <span onClick={() => onNav('cl_explore')} style={{ fontSize: 12, color: T.inkSoft, cursor: 'pointer' }}>Feed →</span>
            </div>
            {followed.map((pro, i) => (
              <div key={pro.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: i > 0 ? 12 : 0, paddingBottom: 12 }}>
                  <Avatar pro={pro} size={46} fs={20} />
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => onNav('cl_pro', pro)}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: '0 0 1px' }}>{pro.name}</p>
                    <p style={{ fontSize: 11, color: T.inkSoft, margin: '0 0 6px' }}>{pro.cat} · {pro.city}</p>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {pro.slots.slice(0, 3).map(s => (
                        <button key={s} onClick={e => { e.stopPropagation(); onNav('cl_prenota', { pro, preselSlot: s }) }} style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${T.line}`, background: T.surface, cursor: 'pointer', fontSize: 11, fontWeight: 500, color: T.ink, fontFamily: 'inherit' }}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <svg onClick={() => onNav('cl_pro', pro)} style={{ cursor: 'pointer' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.line} strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                </div>
                {i < followed.length - 1 && <Div />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
