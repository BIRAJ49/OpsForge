import { Link } from 'react-router-dom'
import { ArrowRight, Boxes, Cloud, Download, FileCode2, Gauge, GitBranch, HeartPulse, ShieldCheck, TerminalSquare } from 'lucide-react'
import heroImage from '../../assets/hero.png'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'

const supported = [
  ['Project Generation', 'Create projects and generate Docker, Kubernetes, Helm, CI/CD, Argo CD, Terraform, and README files.', Boxes, 'cyan'],
  ['GitHub and GHCR', 'Push generated files to GitHub and build Docker images for GitHub Container Registry.', GitBranch, 'purple'],
  ['Argo CD GitOps', 'Deploy applications to Kubernetes with Argo CD sync and deployment history.', Cloud, 'blue'],
  ['Kubernetes Ops', 'Inspect pods, deployments, services, ingress, configmaps, secrets metadata, HPA, logs, and events.', FileCode2, 'green'],
  ['Observability', 'View monitoring data, request rate, latency, errors, pod restarts, service health, and logs.', Gauge, 'amber'],
  ['Security Scans', 'Run Trivy scans and review vulnerabilities, Kubernetes misconfigurations, secret findings, and policy issues.', ShieldCheck, 'cyan'],
  ['Incident Response', 'Review incidents and request restart, scale, rollback, log collection, or resolution actions.', HeartPulse, 'rose'],
]

export default function LandingPage({ user }) {
  const dashboardPath = user?.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard'
  const startPath = user ? dashboardPath : '/login'

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6 lg:-mx-8">
      <section className="relative min-h-[calc(100svh-4rem)] overflow-hidden border-b border-slate-800">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.98)_0%,rgba(8,17,31,0.88)_48%,rgba(8,17,31,0.54)_100%)]" />
        <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl flex-col justify-center px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <Badge tone="cyan" className="mb-4 gap-2 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              DevOps workspace
            </Badge>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              Generate DevOps files, deploy with GitOps, and keep Kubernetes work visible.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Create or upload a project, generate the files you need, push them to GitHub, publish images to GHCR, deploy with Argo CD, and track scans, logs, incidents, and healing requests.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to={startPath}><Button size="lg" icon={ArrowRight}>Get Started</Button></Link>
              <Link to={user ? dashboardPath : '/login'}><Button size="lg" variant="secondary">{user ? 'Dashboard' : 'Login'}</Button></Link>
              <Link to="/generate"><Button size="lg" variant="ghost">Generate as Guest</Button></Link>
            </div>
          </div>
          <div className="mt-12 grid max-w-4xl gap-3 rounded-lg border border-slate-700/70 bg-slate-950/70 p-3 shadow-2xl shadow-slate-950/30 backdrop-blur md:grid-cols-[190px_1fr]">
            <div className="rounded-md border border-cyan-400/20 bg-cyan-400/10 p-4">
              <TerminalSquare className="h-5 w-5 text-cyan-200" />
              <p className="mt-3 text-sm font-semibold text-white">Project flow</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Generate, push, build, deploy, watch, scan, fix.</p>
            </div>
            <div className="custom-scrollbar overflow-x-auto rounded-md bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-300">
              <p className="text-cyan-300">$ opsforge generate --type kubernetes --level advanced</p>
              <p>created repo files, pushed to GitHub, built the image, updated GitOps, synced Argo CD</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">What it covers</h2>
            <p className="mt-2 text-sm text-slate-400">The parts of the DevOps flow this dashboard handles.</p>
          </div>
          <Link to={user ? dashboardPath : '/login'}><Button variant="secondary" icon={Download}>Open Dashboard</Button></Link>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {supported.map(([label, description, Icon, tone]) => (
            <Card key={label} hover className="bg-slate-900/70">
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950">
                    <Icon className="h-5 w-5 text-cyan-300" />
                  </div>
                  <div>
                    <Badge tone={tone}>{label}</Badge>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-950/65">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white">How it works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {['Select project type', 'Choose difficulty level', 'Generate project plan', 'Download ZIP/PDF files'].map((step, index) => (
              <div key={step} className="relative rounded-lg border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-400/10 text-sm font-bold text-cyan-100">{index + 1}</div>
                <p className="mt-4 font-medium text-slate-100">{step}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {index === 0 ? 'Start with Docker, Kubernetes, CI/CD, Terraform, AWS, monitoring, or healing actions.' : null}
                  {index === 1 ? 'Pick beginner, intermediate, or advanced to shape the generated plan.' : null}
                  {index === 2 ? 'Create architecture notes, implementation steps, starter files, and README content.' : null}
                  {index === 3 ? 'Export generated projects as downloadable ZIP and PDF files.' : null}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
