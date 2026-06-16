import { useState } from 'react'
import { T } from '../../styles/tokens'
import { Avatar } from '../../components/ui/Avatar'
import { ALL_PROS, FEED } from '../../lib/constants'

function Photo({ src, style }) {
  const [err, setErr] = useState(false)
  if (err || !src) return <div style={{ background: 'linear-gradient(160deg,#C9A96E,#8B5E3C)', ...style }} />
  return <img src={src} onError={() => setErr(true)} style={{ objectFit: 'cover', display: 'block', ...style }} alt="" />
}

const CATS = ['Tutti', 'Nail Art', 'Capelli', 'Barba']

export default function ExplorePage({ onNav }) {
  const [cat, setCat] = useState('Tutti')
  const posts = cat === 'Tutti' ? FEED : FEED.filter(p => p.cat === cat)

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: T.white, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ padding: '50px 0 0' }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '9px 12px' }}>
            {CATS.map(c => (
              <button key={c} onClick={() => setCat(c)} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: cat === c ? T.ink : T.surface, color: cat === c ? T.white : T.inkMid, fontFamily: 'inherit' }}>{c}</button>
            ))}
          </div>
        </div>
      </div>
      {posts.map(post => {
        const pro = ALL_PROS.find(p => p.id === post.proId) || ALL_PROS[0]
        return (
          <div key={post.id} style={{ background: T.white, borderBottom: `1px solid ${T.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px' }}>
              <Avatar pro={pro} size={33} fs={15} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: 0 }}>@{pro.handle}</p>
                <p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>{pro.city} · {post.cat}</p>
              </div>
              <button onClick={() => onNav('cl_prenota', { pro })} style={{ padding: '6px 12px', borderRadius: 99, border: 'none', background: T.ink, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: T.white, fontFamily: 'inherit' }}>Prenota</button>
            </div>
            <Photo src={post.imgs[0]} style={{ width: '100%', aspectRatio: '4/5' }} />
            <div style={{ padding: '9px 13px 4px' }}>
              <p style={{ fontSize: 13, color: T.ink, margin: '0 0 3px', lineHeight: 1.5 }}><span style={{ fontWeight: 700, marginRight: 3 }}>@{pro.handle}</span>{post.caption}</p>
              <p style={{ fontSize: 11, color: '#6366F1', margin: '0 0 8px' }}>{post.tags.map(t => <span key={t} style={{ marginRight: 4 }}>{t}</span>)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
