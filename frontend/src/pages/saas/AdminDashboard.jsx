import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Database,
  FileCode2,
  FolderGit2,
  Gauge,
  GitBranch,
  HeartPulse,
  Image,
  LayoutDashboard,
  Lock,
  MonitorDot,
  Rocket,
  Search,
  Server,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Users,
  Zap,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { api, apiErrorMessage, unwrap } from '../../services/api'

const sidebarItems = [
  [LayoutDashboard, 'Overview', '/admin/dashboard', true],
  [Boxes, 'Projects', '/admin/generated-projects'],
  [FileCode2, 'AI Generator', '/generate'],
  [GitBranch, 'Repositories', '/admin/generated-projects'],
  [Image, 'Images', '/admin/system-usage'],
  [Rocket, 'Deployments', '/admin/system-usage'],
  [GitBranch, 'GitOps', '/admin/system-usage'],
  [Server, 'Kubernetes', '/admin/system-usage'],
  [Gauge, 'Monitoring', '/admin/system-usage'],
  [TerminalSquare, 'Logs', '/admin/system-usage'],
  [AlertTriangle, 'Incidents', '/admin/system-usage'],
  [Lock, 'Security', '/admin/system-usage'],
  [Zap, 'Self-Healing', '/admin/system-usage'],
  [Settings, 'Settings', '/profile'],
  [Users, 'Users', '/admin/user-management'],
]

const healthBars = [42, 78, 64, 96, 96, 86, 96]
const clusterBars = [36, 66, 55, 82, 82, 74, 82]
const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function Panel({ children, className = '' }) {
  return <section className={`rounded-lg border border-slate-800 bg-slate-950/75 ${className}`}>{children}</section>
}

function StatCard({ icon: Icon, label, value, detail, tone = 'cyan' }) {
  const tones = {
    cyan: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
    green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    amber: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    rose: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  }
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold text-white">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{detail}</p>
        </div>
        <div className={`rounded-lg border p-2 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Panel>
  )
}

function BarChart({ values }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex h-44 items-end gap-3">
        {values.map((value, index) => (
          <div key={`${value}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-md bg-cyan-400 shadow-lg shadow-cyan-950/40" style={{ height: `${value}%` }} />
            <span className="text-xs text-slate-500">{days[index]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [apiNotice, setApiNotice] = useState('')
  const activeTypes = stats?.most_used_project_types?.length || 0
  const activeUsers = users.filter((user) => user.is_active).length
  const recentActivity = stats?.activity?.length
    ? stats.activity.map((item, index) => [item.label, `${index + 2} min ago`])
    : [
        ['Generated Helm chart', '2 min ago'],
        ['Pushed code to GitHub', '3 min ago'],
        ['Published image to GHCR', '4 min ago'],
        ['Argo CD synced prod', '5 min ago'],
        ['Trivy scan completed', '6 min ago'],
      ]

  useEffect(() => {
    async function loadAdminData() {
      try {
        const [userRows, statData] = await Promise.all([
          api.get('/admin/users'),
          api.get('/admin/stats'),
        ])
        setUsers(unwrap(userRows) || [])
        setStats(unwrap(statData))
      } catch (error) {
        setApiNotice(apiErrorMessage(error, 'Admin API data is unavailable. Showing local generation telemetry.'))
      }
    }
    loadAdminData()
  }, [])

  return (
    <div className="mx-auto max-w-[1500px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
      <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-slate-800 bg-slate-950/80 p-4 lg:block">
          <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
                <Settings className="h-4 w-4 text-cyan-300" />
              </div>
              <div>
                <p className="font-bold text-white">OpsForge</p>
                <p className="text-xs text-slate-500">AI DevOps Platform</p>
              </div>
            </div>
          </div>
          <div className="mb-5 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Workspace</p>
            <p className="mt-2 text-sm text-slate-200">Biraj / Production</p>
          </div>
          <nav className="space-y-1">
            {sidebarItems.map(([Icon, label, to, active]) => (
              <Link
                key={label}
                to={to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${active ? 'border border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        <div>
          <header className="flex flex-col gap-4 border-b border-slate-800 bg-slate-950/80 p-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">Control Center</p>
              <h1 className="mt-1 text-2xl font-bold text-white">Overview</h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-500 sm:w-72">
                <Search className="h-4 w-4 shrink-0" />
                <span className="truncate">Search projects, users, activity...</span>
              </div>
              <Link to="/generate"><Button size="sm">New Project</Button></Link>
              <Badge tone="purple">Biraj · Admin</Badge>
            </div>
          </header>

          <main className="mx-auto max-w-6xl space-y-6 p-5 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl font-bold text-white">Platform Overview</h2>
                <p className="mt-2 text-sm text-slate-400">Generate, monitor, secure, and manage DevOps projects from one control center.</p>
              </div>
              <Badge tone="green">All systems operational</Badge>
            </div>

            {apiNotice ? <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{apiNotice}</div> : null}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={FolderGit2} label="Total Projects" value={stats?.total_projects ?? 0} detail={`${activeTypes} active project types`} />
              <StatCard icon={Rocket} label="Active Users" value={stats?.active_users ?? activeUsers} detail={`${stats?.total_users ?? users.length} total registered users`} tone="green" />
              <StatCard icon={AlertTriangle} label="Open Incidents" value="0" detail="No high severity alerts" tone="amber" />
              <StatCard icon={ShieldCheck} label="Downloads" value={stats?.total_downloads ?? 0} detail="ZIP and PDF exports" tone="rose" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <Panel className="p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-white">Deployment Health</h3>
                  <p className="mt-1 text-sm text-slate-400">Success trend for the last 7 days</p>
                </div>
                <BarChart values={healthBars} />
              </Panel>

              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
                <div className="mt-4 space-y-2">
                  {recentActivity.map(([label, time]) => (
                    <div key={`${label}-${time}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-cyan-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-200">{label}</p>
                          <p className="mt-1 text-xs text-slate-500">{time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-white">Quick Actions</h3>
                <div className="mt-4 space-y-2">
                  {[
                    ['Generate DevOps Files', '/generate'],
                    ['View Generated Projects', '/admin/generated-projects'],
                    ['Manage Users', '/admin/user-management'],
                    ['Review System Usage', '/admin/system-usage'],
                    ['Open Profile Settings', '/profile'],
                  ].map(([label, to]) => (
                    <Link key={label} to={to} className="flex items-center justify-between rounded-full border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-100">
                      {label}
                      <ChevronRight className="h-4 w-4 text-cyan-300" />
                    </Link>
                  ))}
                </div>
              </Panel>

              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-white">Cluster Health</h3>
                <div className="mt-4 space-y-4">
                  {[
                    ['CPU Usage', 51],
                    ['Memory Usage', 58],
                    ['Running Services', 95],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-slate-300">{label}</span>
                        <span className="text-slate-500">{value}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                  <BarChart values={clusterBars} />
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Panel className="p-4">
                <Database className="mb-3 h-5 w-5 text-cyan-300" />
                <p className="font-semibold text-white">Database</p>
                <p className="mt-1 text-sm text-slate-400">Neon PostgreSQL connected</p>
              </Panel>
              <Panel className="p-4">
                <MonitorDot className="mb-3 h-5 w-5 text-emerald-300" />
                <p className="font-semibold text-white">Monitoring</p>
                <p className="mt-1 text-sm text-slate-400">Usage signals available</p>
              </Panel>
              <Panel className="p-4">
                <HeartPulse className="mb-3 h-5 w-5 text-amber-300" />
                <p className="font-semibold text-white">Self-Healing</p>
                <p className="mt-1 text-sm text-slate-400">Ready for workflow rules</p>
              </Panel>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
