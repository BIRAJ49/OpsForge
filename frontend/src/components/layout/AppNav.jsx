import { Link, NavLink, useNavigate } from 'react-router-dom'
import { FileCode2, LogOut } from 'lucide-react'
import { Button } from '../ui/Button'

export function AppNav({ user, onLogout }) {
  const navigate = useNavigate()
  const profileLabel = user?.name || 'Profile'
  const links = !user
    ? [
        ['Home', '/'],
        ['Generate as Guest', '/generate'],
      ]
    : user.role === 'ADMIN'
      ? [
          ['Dashboard', '/admin/dashboard'],
          ['Generate Project', '/generate'],
          ['My Projects', '/my-projects'],
          ['Admin Panel', '/admin/user-management'],
          ['System Usage', '/admin/system-usage'],
          [profileLabel, '/profile'],
        ]
      : [
          ['Dashboard', '/dashboard'],
          ['Generate Project', '/generate'],
          ['My Projects', '/my-projects'],
          [profileLabel, '/profile'],
        ]

  function logout() {
    onLogout()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/85 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 shadow-lg shadow-cyan-950/40">
            <FileCode2 className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <p className="font-bold text-white">OpsForge</p>
            <p className="text-xs text-slate-500">AI DevOps Platform</p>
          </div>
        </Link>
        <nav className="order-3 flex w-full gap-1 overflow-x-auto pb-1 md:order-none md:ml-auto md:w-auto md:max-w-[760px] md:pb-0 xl:max-w-none">
          {links.map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-slate-800 text-white ring-1 ring-cyan-400/30' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-2">
          {user ? (
            <>
              <Button variant="ghost" icon={LogOut} onClick={logout}>Logout</Button>
            </>
          ) : (
            <Link to="/login"><Button variant="secondary">Login</Button></Link>
          )}
        </div>
      </div>
    </header>
  )
}
