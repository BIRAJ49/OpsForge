import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Cloud,
  Download,
  FileCode2,
  FolderGit2,
  Gauge,
  GitBranch,
  HeartPulse,
  Home,
  Image,
  Lock,
  Rocket,
  Search,
  Server,
  Settings,
  ShieldCheck,
  TerminalSquare,
  UploadCloud,
  Zap,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { projectsForUser } from '../../utils/generator'
import { api, unwrap } from '../../services/api'

const sidebarItems = [
  [Home, 'Home', '/dashboard', true],
  [Boxes, 'Projects', '/app/projects'],
  [FileCode2, 'Generated Files', '/app/generated-files'],
  [GitBranch, 'GitHub Repo', '/app/connect-github'],
  [Image, 'Container Images', '/app/deployments'],
  [Rocket, 'Deployments', '/app/deployments'],
  [GitBranch, 'GitOps Status', '/app/gitops'],
  [Server, 'Kubernetes', '/app/kubernetes'],
  [Gauge, 'Monitoring', '/app/monitoring'],
  [TerminalSquare, 'Logs', '/app/logs'],
  [AlertTriangle, 'Incidents', '/app/incidents'],
  [Lock, 'Security Scan', '/app/security'],
  [Zap, 'Self-Healing', '/app/incidents'],
  [Settings, 'Settings', '/app/settings'],
]

const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const activityBars = [42, 68, 55, 82, 89, 74, 88]

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

function BarChart() {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex h-52 items-end gap-3">
        {activityBars.map((value, index) => (
          <div key={`${value}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-md bg-cyan-400 shadow-lg shadow-cyan-950/40" style={{ height: `${value}%` }} />
            <span className="text-xs text-slate-500">{days[index]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgressLine({ label, value }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-500">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-900">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export default function UserDashboard({ user }) {
  const [dashboard, setDashboard] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const localProjects = projectsForUser(user)
  const projects = dashboard?.recent_projects?.length
    ? dashboard.recent_projects.map((project) => ({
        id: `backend-${project.id}`,
        title: project.title,
        projectType: project.project_type,
        environment: project.environment,
        deploymentType: project.deployment_type,
      }))
    : localProjects
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredProjects = normalizedSearch
    ? projects.filter((project) =>
        [
          project.title,
          project.projectType,
          project.difficulty,
          project.environment,
          project.deploymentType,
          project.requirement,
          ...(project.tools || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : projects
  const downloads = dashboard?.downloads ?? localProjects.reduce((sum, project) => sum + (project.downloads?.zip || 0) + (project.downloads?.pdf || 0), 0)
  const currentProject = filteredProjects[0] || projects[0]
  const activityProjects = normalizedSearch ? filteredProjects : projects
  const recentActivity = activityProjects.length
    ? activityProjects.slice(0, 5).map((project, index) => [`Generated ${project.projectType} project`, `${index + 3} min ago`, project.id])
    : [
        ['Generated Helm chart for job-portal', '3 min ago', 'demo-1'],
        ['Pushed code to GitHub', '4 min ago', 'demo-2'],
        ['Published image to GHCR', '5 min ago', 'demo-3'],
        ['Argo CD synced production', '6 min ago', 'demo-4'],
        ['Trivy scan completed', '7 min ago', 'demo-5'],
      ]

  useEffect(() => {
    async function loadDashboard() {
      try {
        setDashboard(unwrap(await api.get('/users/dashboard')))
      } catch {
        setDashboard(null)
      }
    }
    loadDashboard()
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
                <p className="text-xs text-slate-500">User Workspace</p>
              </div>
            </div>
          </div>
          <div className="mb-5 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Current Project</p>
            <p className="mt-2 text-sm font-medium text-slate-200">{currentProject?.title || 'No project selected'}</p>
            <p className="mt-1 text-xs text-slate-500">Environment: Development</p>
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
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">OpsForge Workspace</p>
              <h1 className="mt-1 text-2xl font-bold text-white">Project Control Center</h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-500 transition focus-within:border-cyan-400/70 focus-within:bg-slate-950 sm:w-72">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
                  placeholder="Search my projects..."
                />
              </label>
              <Link to="/generate"><Button size="sm">Create Project</Button></Link>
              <Link to="/app/upload-project"><Button size="sm" variant="secondary" icon={UploadCloud}>Upload Project</Button></Link>
              <Link to="/app/connect-github"><Button size="sm" variant="secondary" icon={GitBranch}>Connect GitHub</Button></Link>
            </div>
          </header>

          <main className="mx-auto max-w-6xl space-y-6 p-5 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-3xl text-sm text-slate-400">
                A focused dashboard for creating, saving, downloading, and reviewing your own DevOps projects.
              </p>
              <Badge tone="cyan">User access</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={FolderGit2} label="Projects" value={dashboard?.total_projects ?? projects.length} detail="Only your projects" />
              <StatCard icon={Rocket} label="Saved Projects" value={dashboard?.saved_projects ?? projects.length} detail="Available in history" tone="green" />
              <StatCard icon={AlertTriangle} label="Open Incidents" value="0" detail="No active incidents" tone="amber" />
              <StatCard icon={Download} label="Downloads" value={downloads} detail="ZIP and PDF exports" tone="rose" />
            </div>

            {normalizedSearch ? (
              <Panel className="p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Search Results</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {filteredProjects.length ? `${filteredProjects.length} project${filteredProjects.length === 1 ? '' : 's'} matched "${searchQuery}".` : `No projects matched "${searchQuery}".`}
                    </p>
                  </div>
                  <button type="button" onClick={() => setSearchQuery('')} className="text-sm font-medium text-cyan-200 transition hover:text-cyan-100">
                    Clear search
                  </button>
                </div>
                {filteredProjects.length ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {filteredProjects.slice(0, 6).map((project) => {
                      const backendId = project.id?.startsWith('backend-') ? project.id.replace('backend-', '') : null
                      return (
                        <Link
                          key={project.id}
                          to={backendId ? `/app/projects/${backendId}/analysis` : `/result/${project.id}`}
                          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition hover:border-cyan-400/50 hover:bg-slate-900"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-white">{project.title}</p>
                              <p className="mt-1 text-sm text-slate-400">{project.projectType || 'Project'}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-cyan-300" />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                ) : null}
              </Panel>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              <Panel className="p-5">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-white">My Deployment Activity</h3>
                  <p className="mt-1 text-sm text-slate-400">Successful generation and download activity for your projects this week</p>
                </div>
                <BarChart />
              </Panel>

              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-white">Quick Actions</h3>
                <div className="mt-4 space-y-2">
                  {[
                    ['Open Project Analysis', currentProject?.id?.startsWith('backend-') ? `/app/projects/${currentProject.id.replace('backend-', '')}/analysis` : '/app/project-analysis'],
                    ['Generate DevOps Files', '/generate'],
                    ['View Projects', '/app/projects'],
                    ['Open Latest Result', currentProject ? `/result/${currentProject.id}` : '/generate'],
                    ['Manage Profile', '/profile'],
                  ].map(([label, to]) => (
                    <Link key={label} to={to} className="flex items-center justify-between rounded-full border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-100">
                      {label}
                      <ChevronRight className="h-4 w-4 text-cyan-300" />
                    </Link>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-white">Current Project Health</h3>
                <div className="mt-4 space-y-5">
                  <ProgressLine label="Generation Health" value={projects.length ? 96 : 0} />
                  <ProgressLine label="Download Readiness" value={projects.length ? 88 : 0} />
                  <ProgressLine label="History Coverage" value={projects.length ? 72 : 0} />
                  <ProgressLine label="Security Score" value={projects.length ? 82 : 0} />
                </div>
                {!projects.length ? <p className="mt-5 text-sm text-slate-500">Generate your first project to populate health signals.</p> : null}
              </Panel>

              <Panel className="p-5">
                <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
                <div className="mt-4 space-y-3">
                  {recentActivity.map(([label, time, id]) => (
                    <div key={id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
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

            <div className="grid gap-4 md:grid-cols-3">
              <Panel className="p-4">
                <Cloud className="mb-3 h-5 w-5 text-cyan-300" />
                <p className="font-semibold text-white">Project Types</p>
                <p className="mt-1 text-sm text-slate-400">Docker, Kubernetes, CI/CD, Terraform, AWS, monitoring, self-healing</p>
              </Panel>
              <Panel className="p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-emerald-300" />
                <p className="font-semibold text-white">Account Scope</p>
                <p className="mt-1 text-sm text-slate-400">You only see projects generated under your account.</p>
              </Panel>
              <Panel className="p-4">
                <HeartPulse className="mb-3 h-5 w-5 text-amber-300" />
                <p className="font-semibold text-white">Downloads</p>
                <p className="mt-1 text-sm text-slate-400">Export generated plans as ZIP and PDF files.</p>
              </Panel>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
