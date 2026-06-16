import { T } from '../../styles/tokens'

const IH = ({ a }) => <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? T.ink : 'none'} stroke={a ? T.ink : T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
const IC = ({ a }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? T.ink : T.inkSoft} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" fill={a ? T.ink : 'none'}/></svg>
const IK = ({ a }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? T.ink : T.inkSoft} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.3" fill={a ? T.ink : T.inkSoft}/></svg>
const IP = ({ a }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? T.ink : T.inkSoft} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>

const NAV_ITEMS = [
  { id: 'cl_home', I: IH, l: 'Home' },
  { id: 'cl_explore', I: IC, l: 'Esplora' },
  { id: 'cl_appts', I: IK, l: 'Appuntamenti' },
  { id: 'cl_profilo', I: IP, l: 'Profilo' },
]

export default function BottomNavCl({ active, onNav }) {
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
