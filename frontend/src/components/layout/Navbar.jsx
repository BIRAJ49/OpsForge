import { Bell, ChevronDown, LogIn, LogOut, Menu, Moon, Search, Sun } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../ui/Button'

export function Navbar({ user, onLoginClick, onLogout }) {
  const [dark, setDark] = useState(true)
  const location = useLocation()
  const isAdminMode = location.pathname.startsWith('/admin')
  const modeLabel = isAdminMode ? 'Admin Dashboard' : 'Developer Dashboard'
  const isAdmin = user?.role === 'ADMIN'

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="flex h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <label className="relative block max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="h-11 w-full rounded-md border border-slate-700 bg-slate-900/80 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10"
              placeholder="Search projects, clusters, logs, incidents..."
            />
          </label>
        </div>
        <select className="hidden h-11 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-cyan-400/70 sm:block">
          <option>Dev</option>
          <option>Staging</option>
          <option>Prod</option>
        </select>
        {isAdmin ? (
          <Link to={isAdminMode ? '/app/overview' : '/admin/overview'} className="hidden lg:block">
            <Button variant={isAdminMode ? 'secondary' : 'primary'}>
            {isAdminMode ? 'User Mode' : 'Admin Mode'}
            </Button>
          </Link>
        ) : null}
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDark((value) => !value)}
          aria-label="Toggle theme"
        >
          {dark ? <Moon className="h-5 w-5 text-cyan-200" /> : <Sun className="h-5 w-5" />}
        </Button>
        {user ? (
          <>
            <button className="hidden items-center gap-3 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-left transition hover:border-slate-600 md:flex">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-300 to-purple-400" />
              <div>
                <p className="text-sm font-medium text-slate-100">{user.name}</p>
                <p className="text-xs text-slate-500">{user.role === 'ADMIN' ? modeLabel : 'User Dashboard'}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Logout">
              <LogOut className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <Button icon={LogIn} onClick={onLoginClick}>
            Login
          </Button>
        )}
      </div>
    </header>
  )
}
