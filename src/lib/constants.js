export const CATEGORIES = [
  { id: 'tutti', e: '✦', l: 'Tutti' },
  { id: 'parrucchiere', e: '✂️', l: 'Capelli' },
  { id: 'barbiere', e: '🪒', l: 'Barba' },
  { id: 'nail_artist', e: '💅', l: 'Nail' },
  { id: 'estetista', e: '🌿', l: 'Estetica' },
  { id: 'tatuatore', e: '🎨', l: 'Tattoo' },
]

export const STATUS_MAP = {
  confermato: { label: 'Confermato', dot: '#1A9E5C', bg: '#E8F8F0', text: '#1A9E5C' },
  'in attesa': { label: 'In attesa', dot: '#C9A96E', bg: '#FBF5EC', text: '#B45309' },
  cancellato: { label: 'Cancellato', dot: '#D94040', bg: '#FEF2F2', text: '#D94040' },
  completato: { label: 'Completato', dot: '#2563EB', bg: '#EFF6FF', text: '#2563EB' },
}

export const PLANS = [
  { id: 'base', name: 'Base', price: 19, features: ['Agenda fino a 50 appt/mese', '1 membro staff', 'Profilo pubblico', 'Statistiche base'] },
  { id: 'pro', name: 'Pro', price: 39, features: ['Agenda illimitata', 'Staff illimitato', 'Notifiche push', 'Export CSV', 'Statistiche avanzate'], popular: true },
  { id: 'premium', name: 'Premium', price: 79, features: ['Tutto il piano Pro', 'Multi-sede', 'API access', 'Support dedicato'] },
]

export const BETA_DAYS_LEFT = 90

export const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
export const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

export const toMin = (t) => {
  const [h, m] = (t || '09:00').split(':').map(Number)
  return h * 60 + m
}
export const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export const SLOTS = Array.from({ length: 22 }, (_, i) => toTime(8 * 60 + i * 30))

export const ALL_PROS = [
  { id: 1, name: 'Lucia Bianchi', handle: 'lucia.cuts', cat: 'Parrucchiere', catId: 'parrucchiere', city: 'Milano', rating: 4.9, reviews: 142, followers: 1240, verified: true, emoji: '✂️', accent: '#C9A96E', bio: 'Specializzata in colorazioni balayage e tagli moderni. 10 anni di esperienza.', slots: ['10:00', '11:30', '14:00'], services: [{ id: 1, name: 'Taglio donna', price: 45, min: 45 }, { id: 2, name: 'Colore balayage', price: 120, min: 120 }, { id: 3, name: 'Piega', price: 25, min: 30 }] },
  { id: 2, name: 'Marco Ferretti', handle: 'marco.barber', cat: 'Barbiere', catId: 'barbiere', city: 'Milano', rating: 4.8, reviews: 98, followers: 876, verified: true, emoji: '🪒', accent: '#2D3748', bio: 'Barbiere classico con tocco moderno. Rasature tradizionali e tagli fade.', slots: ['09:00', '10:30', '15:00'], services: [{ id: 4, name: 'Taglio uomo', price: 25, min: 30 }, { id: 5, name: 'Barba', price: 15, min: 20 }, { id: 6, name: 'Taglio + barba', price: 35, min: 45 }] },
  { id: 3, name: 'Sofia Nail Art', handle: 'sofia.nails', cat: 'Nail Artist', catId: 'nail_artist', city: 'Roma', rating: 5.0, reviews: 213, followers: 3400, verified: true, emoji: '💅', accent: '#E91E8C', bio: 'Nail artist con stile unico. Gel, acrilico, nail art personalizzata.', slots: ['11:00', '13:00', '16:00'], services: [{ id: 7, name: 'Gel mani', price: 55, min: 60 }, { id: 8, name: 'Nail art', price: 75, min: 90 }, { id: 9, name: 'Ricostruzione', price: 65, min: 75 }] },
  { id: 4, name: 'Elena Estetista', handle: 'elena.beauty', cat: 'Estetista', catId: 'estetista', city: 'Milano', rating: 4.7, reviews: 87, followers: 654, verified: false, emoji: '🌿', accent: '#48BB78', bio: 'Trattamenti viso e corpo personalizzati. Benessere e bellezza naturale.', slots: ['10:00', '14:00', '16:30'], services: [{ id: 10, name: 'Pulizia viso', price: 65, min: 60 }, { id: 11, name: 'Ceretta corpo', price: 40, min: 45 }] },
  { id: 5, name: 'Ink by Davide', handle: 'inkbydavide', cat: 'Tatuatore', catId: 'tatuatore', city: 'Torino', rating: 4.9, reviews: 176, followers: 5200, verified: true, emoji: '🎨', accent: '#6B46C1', bio: 'Tattoo artist specializzato in blackwork e illustrazioni botaniche.', slots: ['12:00', '15:00'], services: [{ id: 12, name: 'Consulenza', price: 0, min: 30 }, { id: 13, name: 'Piccolo tattoo', price: 80, min: 60 }, { id: 14, name: 'Medio tattoo', price: 180, min: 120 }] },
]

export const MY_FOLLOWED_IDS = new Set([1, 3])

export const FEED = [
  { id: 1, proId: 3, cat: 'Nail Art', imgs: ['https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600'], caption: 'Nuovo design primavera 🌸', tags: ['#nailart', '#gel', '#primavera'] },
  { id: 2, proId: 1, cat: 'Capelli', imgs: ['https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600'], caption: 'Balayage naturale su capelli castani ✨', tags: ['#balayage', '#parrucchiere', '#milano'] },
  { id: 3, proId: 2, cat: 'Barba', imgs: ['https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600'], caption: 'Fade classico + barba modellata 💈', tags: ['#barbiere', '#fade', '#beard'] },
  { id: 4, proId: 3, cat: 'Nail Art', imgs: ['https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600'], caption: 'French manicure moderna 💅', tags: ['#french', '#nails', '#beauty'] },
]

export const MY_APPTS_CL = [
  { id: 1, pro: 'Lucia Bianchi', service: 'Colore balayage', date: 'Mer 17 giu', time: '10:00', price: 120, status: 'confermato', dateRaw: new Date(2026, 5, 17).toISOString() },
  { id: 2, pro: 'Marco Ferretti', service: 'Taglio + barba', date: 'Ven 20 giu', time: '14:30', price: 35, status: 'in attesa', dateRaw: new Date(2026, 5, 20).toISOString() },
  { id: 3, pro: 'Sofia Nail Art', service: 'Gel mani', date: 'Mar 10 giu', time: '11:00', price: 55, status: 'completato', dateRaw: new Date(2026, 5, 10).toISOString() },
]

export const SVCS0 = [
  { id: 1, name: 'Taglio donna', price: 45, min: 45 },
  { id: 2, name: 'Piega', price: 25, min: 30 },
  { id: 3, name: 'Colore', price: 90, min: 90 },
  { id: 4, name: 'Balayage', price: 130, min: 120 },
  { id: 5, name: 'Trattamento cheratina', price: 80, min: 60 },
]

export const STAFF0 = [
  { id: 1, name: 'Giulia', role: 'Colorista' },
  { id: 2, name: 'Marco', role: 'Stilista' },
]

export const CLIENTS0 = [
  { id: 1, name: 'Alessia Romano', phone: '+39 333 111 2233', appts: 8, lastVisit: '10 giu', totalSpent: 380 },
  { id: 2, name: 'Federica Martini', phone: '+39 347 555 6677', appts: 3, lastVisit: '1 giu', totalSpent: 155 },
  { id: 3, name: 'Laura Conti', phone: '+39 320 999 8877', appts: 12, lastVisit: '12 giu', totalSpent: 640 },
  { id: 4, name: 'Sara Esposito', phone: '+39 366 123 4455', appts: 5, lastVisit: '5 giu', totalSpent: 225 },
]

export const APPTS0 = [
  { id: 1, client: 'Alessia Romano', service: 'Balayage', time: '09:00', endTime: '11:00', price: 130, status: 'confermato', staff: 'Giulia', dateRaw: new Date(2026, 5, 14).toISOString() },
  { id: 2, client: 'Federica Martini', service: 'Taglio donna', time: '11:30', endTime: '12:15', price: 45, status: 'in attesa', staff: 'Marco', dateRaw: new Date(2026, 5, 14).toISOString() },
  { id: 3, client: 'Laura Conti', service: 'Piega', time: '14:00', endTime: '14:30', price: 25, status: 'confermato', staff: 'Marco', dateRaw: new Date(2026, 5, 14).toISOString() },
  { id: 4, client: 'Sara Esposito', service: 'Colore', time: '15:00', endTime: '16:30', price: 90, status: 'confermato', staff: 'Giulia', dateRaw: new Date(2026, 5, 14).toISOString() },
]

export const HOURS0 = [
  { day: 0, open: false, from: '09:00', to: '13:00' },
  { day: 1, open: true, from: '09:00', to: '19:00' },
  { day: 2, open: true, from: '09:00', to: '19:00' },
  { day: 3, open: true, from: '09:00', to: '19:00' },
  { day: 4, open: true, from: '09:00', to: '19:00' },
  { day: 5, open: true, from: '09:00', to: '19:00' },
  { day: 6, open: true, from: '09:00', to: '17:00' },
]
