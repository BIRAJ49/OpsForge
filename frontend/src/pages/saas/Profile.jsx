import { LogOut, Mail, ShieldCheck, UserRound, CalendarDays } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

export default function Profile({ user, onLogout }) {
  const createdAt = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Available after backend sync'
  const initials = (user.name || user.email || 'U')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-950/75 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10 text-lg font-bold text-cyan-100">
            {initials}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{user.name}</h1>
              <Badge tone={user.role === 'ADMIN' ? 'purple' : 'cyan'}>{user.role}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        <Button variant="danger" icon={LogOut} onClick={onLogout}>Logout</Button>
      </section>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-slate-800 p-5">
            <h2 className="text-lg font-semibold text-white">Account details</h2>
            <p className="mt-1 text-sm text-slate-400">Basic profile information for your OpsForge account.</p>
          </div>
          <div className="divide-y divide-slate-800">
            {[
              [UserRound, 'Full name', user.name],
              [Mail, 'Email address', user.email],
              [ShieldCheck, 'Role', user.role],
              [CalendarDays, 'Account created', createdAt],
            ].map(([Icon, label, value]) => (
              <div key={label} className="grid gap-3 p-5 sm:grid-cols-[220px_1fr] sm:items-center">
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <Icon className="h-4 w-4 text-cyan-300" />
                  {label}
                </div>
                <div className="font-medium text-white">
                  {label === 'Role' ? <Badge tone={user.role === 'ADMIN' ? 'purple' : 'cyan'}>{value}</Badge> : value}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
