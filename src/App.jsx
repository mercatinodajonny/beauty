import { useState } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { T } from './styles/tokens'

import LoginPage from './pages/auth/LoginPage'

import HomePage from './pages/cliente/HomePage'
import ExplorePage from './pages/cliente/ExplorePage'
import ApptsPage from './pages/cliente/ApptsPage'
import ProfilePage from './pages/cliente/ProfilePage'
import ProProfilePage from './pages/cliente/ProProfilePage'
import BookingPage from './pages/cliente/BookingPage'

import AgendaPage from './pages/pro/AgendaPage'
import ClientiPage from './pages/pro/ClientiPage'
import ClienteDetailPage from './pages/pro/ClienteDetailPage'
import ServiziPage from './pages/pro/ServiziPage'
import StatsPage from './pages/pro/StatsPage'
import PianiPage, { BetaBanner, BetaWelcome } from './pages/pro/PianiPage'

import BottomNavCl from './components/layout/BottomNavCl'
import BottomNavPro from './components/layout/BottomNavPro'

function AppInner() {
  const { user, loading } = useAuth()
  const [demoUser, setDemoUser] = useState(null)
  const [screen, setScreen] = useState('login')
  const [navData, setNavData] = useState(null)
  const [showBetaWelcome, setShowBetaWelcome] = useState(false)

  const activeUser = user
    ? { name: user.user_metadata?.name || user.email, type: user.user_metadata?.type || 'cliente', email: user.email }
    : demoUser

  const onNav = (id, data = null) => {
    setScreen(id)
    setNavData(data)
  }

  const handleDemoAuth = (u) => {
    setDemoUser(u)
    setShowBetaWelcome(u.type === 'pro')
    setScreen(u.type === 'pro' ? 'pro_agenda' : 'cl_home')
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.white }}>
      <p style={{ fontSize: 13, color: T.inkSoft }}>Caricamento…</p>
    </div>
  )

  if (!activeUser || screen === 'login') {
    return <LoginPage onDemoAuth={handleDemoAuth} />
  }

  const isPro = activeUser.type === 'pro'

  const renderPage = () => {
    switch (screen) {
      case 'cl_home': return <HomePage onNav={onNav} user={activeUser} />
      case 'cl_explore': return <ExplorePage onNav={onNav} />
      case 'cl_appts': return <ApptsPage onNav={onNav} />
      case 'cl_profilo': return <ProfilePage onNav={onNav} user={activeUser} />
      case 'cl_pro': return <ProProfilePage pro={navData} onNav={onNav} />
      case 'cl_prenota': return <BookingPage data={navData || {}} onNav={onNav} />
      case 'pro_agenda': return (
        <div>
          <BetaBanner onNav={onNav} />
          <AgendaPage onNav={onNav} />
        </div>
      )
      case 'pro_clienti': return <ClientiPage onNav={onNav} />
      case 'pro_cliente': return <ClienteDetailPage client={navData} onNav={onNav} />
      case 'pro_servizi': return <ServiziPage onNav={onNav} />
      case 'pro_stats': return <StatsPage onNav={onNav} />
      case 'pro_piani': return <PianiPage onNav={onNav} />
      default: return isPro ? <AgendaPage onNav={onNav} /> : <HomePage onNav={onNav} user={activeUser} />
    }
  }

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100dvh', position: 'relative', background: T.white }}>
      {renderPage()}
      {isPro
        ? <BottomNavPro active={screen} onNav={onNav} />
        : <BottomNavCl active={screen} onNav={onNav} />
      }
      {showBetaWelcome && <BetaWelcome onClose={() => setShowBetaWelcome(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
