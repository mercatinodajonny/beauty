import { T } from '../../styles/tokens'

const IK = ({ a }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? T.ink : T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.3" fill={a ? T.ink : T.inkSoft}/></svg>
const IU = ({ a }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? T.ink : T.inkSoft} strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
const ICS = ({ a }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? T.ink : T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
const IS = ({ a }) => <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? T.ink : 'none'} stroke={a ? T.ink : T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>

const NAV_ITEMS = [
  { id: 'pro_agenda', I: IK, l: 'Agenda' },
  { id: 'pro_clienti', I: IU, l: 'Clienti' },
  { id: 'pro_servizi', I: ICS, l: 'Servizi' },
  { id: 'pro_stats', I: IS, l: 'Statistiche' },
]

export default function BottomNavPro({ active, onNav }) {
  return (
    <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderTop: `1px solid ${T.line}`, display: 'flex', zIndex: 100 }}>
      {NAV_ITEMS.map(({ id, I, l }) => (
        <button key={id} onClick={() => onNav(id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 0 14px', border: 'none', background: 'none', cursor: 'pointer' }}>
          <I a={active === id} />
          <span style={{ fontSize: 10, fontWeight: active === id ? 700 : 400, color: active === id ? T.ink : T.inkSoft }}>{l}</span>
        </button>
      ))}
    </div>
  )
}
