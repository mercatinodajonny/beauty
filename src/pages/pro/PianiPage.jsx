import { useState } from 'react'
import { T } from '../../styles/tokens'
import { PLANS, BETA_DAYS_LEFT } from '../../lib/constants'
import { BigBtn } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'

export function BetaBanner({ onNav }) {
  return (
    <div onClick={() => onNav?.('pro_piani')} style={{ margin: '8px 16px', padding: '10px 14px', background: T.goldBg, borderRadius: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: T.gold, margin: '0 0 1px' }}>🎉 Beta gratuita</p>
        <p style={{ fontSize: 11, color: T.inkSoft, margin: 0 }}>Ancora {BETA_DAYS_LEFT} giorni gratis</p>
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.gold} strokeWidth="2.2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
    </div>
  )
}

export function BetaWelcome({ onClose }) {
  return (
    <Modal title="" onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
        <p style={{ fontSize: 40, marginBottom: 12 }}>🎉</p>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Benvenuto in BeautyApp!</h2>
        <p style={{ fontSize: 14, color: T.inkMid, lineHeight: 1.6, marginBottom: 18 }}>
          Hai accesso a tutte le funzionalità <strong>gratuitamente</strong> per i prossimi <strong>{BETA_DAYS_LEFT} giorni</strong> (fino al 14 settembre 2026).
        </p>
        <div style={{ background: T.goldBg, borderRadius: 11, padding: '12px 16px', marginBottom: 20, textAlign: 'left' }}>
          {['Agenda illimitata', 'Clienti e statistiche', 'Notifiche push', 'Export CSV', 'Profilo pubblico'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <span style={{ color: T.gold, fontWeight: 700 }}>✓</span>
              <span style={{ fontSize: 13, color: T.ink }}>{f}</span>
            </div>
          ))}
        </div>
        <BigBtn label="Inizia ad usare l'app" onClick={onClose} />
      </div>
    </Modal>
  )
}

export default function PianiPage() {
  const [sel, setSel] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '50px 16px 14px', borderBottom: `1px solid ${T.line}` }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.ink, margin: '0 0 6px' }}>Piani</h1>
        <div style={{ background: T.goldBg, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🎉</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.gold, margin: '0 0 2px' }}>Beta gratuita attiva</p>
            <p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>Hai ancora <strong>{BETA_DAYS_LEFT} giorni</strong> di accesso completo gratuito</p>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <p style={{ fontSize: 13, color: T.inkMid, lineHeight: 1.6, marginBottom: 16 }}>
          Dopo il periodo beta, scegli il piano più adatto al tuo salone:
        </p>
        {(PLANS || [
          { id: 'base', name: 'Base', price: 19, features: ['Agenda fino a 50 appt/mese', '1 membro staff', 'Profilo pubblico', 'Statistiche base'] },
          { id: 'pro', name: 'Pro', price: 39, features: ['Agenda illimitata', 'Staff illimitato', 'Notifiche push', 'Export CSV', 'Statistiche avanzate'], popular: true },
          { id: 'premium', name: 'Premium', price: 79, features: ['Tutto il piano Pro', 'Multi-sede', 'API access', 'Support dedicato'] },
        ]).map(plan => (
          <div key={plan.id} onClick={() => setSel(plan.id)} style={{ border: `2px solid ${sel === plan.id ? T.ink : plan.popular ? T.gold : T.line}`, borderRadius: 16, padding: '16px', marginBottom: 12, cursor: 'pointer', background: sel === plan.id ? T.surface : T.white, position: 'relative', overflow: 'hidden' }}>
            {plan.popular && <div style={{ position: 'absolute', top: 10, right: 12, background: T.gold, color: T.ink, fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 99 }}>POPOLARE</div>}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: T.ink, margin: 0 }}>{plan.name}</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: '0 0 0 auto' }}>{plan.price}€<span style={{ fontSize: 11, fontWeight: 400, color: T.inkSoft }}>/mese</span></p>
            </div>
            {plan.features.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <span style={{ color: T.green, fontSize: 12, fontWeight: 700 }}>✓</span>
                <span style={{ fontSize: 12, color: T.inkMid }}>{f}</span>
              </div>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 8 }}>
          <BigBtn label="Scegli piano" disabled={!sel} onClick={() => setShowConfirm(true)} />
          <p style={{ fontSize: 11, color: T.inkSoft, textAlign: 'center', marginTop: 8 }}>Attivazione dopo il periodo beta · Disdici quando vuoi</p>
        </div>
      </div>

      {showConfirm && (
        <Modal title="Conferma piano" onClose={() => setShowConfirm(false)}>
          <p style={{ fontSize: 14, color: T.inkMid, lineHeight: 1.6, marginBottom: 16 }}>Il piano <strong>{sel}</strong> verrà attivato automaticamente al termine del periodo beta (14 settembre 2026).</p>
          <BigBtn label="Conferma" onClick={() => setShowConfirm(false)} />
        </Modal>
      )}
    </div>
  )
}
