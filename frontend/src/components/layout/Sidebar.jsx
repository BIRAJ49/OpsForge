import { NavLink } from 'react-router-dom'
import { FileCode2, ShieldCheck } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { adminNavItems, canAccess, userNavItems } from '../../config/navigation'

export function Sidebar({ role }) {
  const location = useLocation()
  const isAdminMode = location.pathname.startsWith('/admin')
  const allItems = isAdminMode ? adminNavItems : userNavItems
  const navItems = allItems.filter((item) => canAccess(role, item.minRole))
  const subtitle = isAdminMode ? 'Admin Dashboard' : 'User Dashboard'
  const footerText = isAdminMode ? 'Platform governance' : 'Self-healing enabled'
  const footerDetail = isAdminMode
    ? 'Audit, policy, and cluster controls'
    : '4 automated actions in the last 24h'

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-slate-800 bg-slate-950/90 backdrop-blur lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-20 items-center gap-3 border-b border-slate-800 px-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
              <FileCode2 className="h-6 w-6 text-cyan-300" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">OpsForge</p>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <div className="border-b border-slate-800 px-6 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Logged in as</p>
            <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-medium text-slate-100">{role === 'ADMIN' ? 'Admin' : 'User'}</span>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-5 custom-scrollbar">
            {navItems.length ? navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  `mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-100 shadow-lg shadow-cyan-950/20'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </NavLink>
            )) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                Admin dashboard access requires an admin account.
              </div>
            )}
          </nav>
          <div className="border-t border-slate-800 p-4">
            <div className="rounded-lg border border-purple-400/20 bg-purple-400/10 p-4">
              <p className="text-sm font-semibold text-purple-100">{footerText}</p>
              <p className="mt-1 text-xs text-slate-400">{footerDetail}</p>
            </div>
          </div>
        </div>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-2 overflow-x-auto border-t border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur lg:hidden custom-scrollbar">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex min-w-fit flex-col items-center gap-1 rounded-md px-3 py-2 text-[11px] ${
                isActive ? 'bg-cyan-400/10 text-cyan-100' : 'text-slate-500'
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
