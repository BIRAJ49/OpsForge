import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Cpu, Database, FolderGit2, Rocket, ShieldCheck, Timer } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { ChartCard } from '../components/ui/ChartCard'
import { resourceUsageData } from '../data/mockData'
import { api, unwrap } from '../services/api'

const icons = [FolderGit2, Rocket, AlertTriangle, Activity, ShieldCheck, Cpu, Database, Timer]

function normalizeMetricSeries(cpuData = [], memoryData = [], requestData = []) {
  if (!cpuData.length) return resourceUsageData
  return cpuData.map((point, index) => ({
    time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: point.value,
    memory: memoryData[index]?.value || 0,
    requests: requestData[index]?.value || 0,
  }))
}

function deploymentChart(projects) {
  const grouped = projects.reduce((acc, project) => {
    const key = project.environment || 'unknown'
    acc[key] ||= { group: key, gitops: 0, kubernetes: 0, docker: 0, other: 0 }
    const deploymentType = project.deployment_type || project.deploymentType || 'other'
    if (deploymentType.includes('gitops')) acc[key].gitops += 1
    else if (deploymentType.includes('kubernetes') || deploymentType.includes('helm')) acc[key].kubernetes += 1
    else if (deploymentType.includes('docker')) acc[key].docker += 1
    else acc[key].other += 1
    return acc
  }, {})
  return Object.values(grouped).length ? Object.values(grouped) : [{ group: 'none', gitops: 0, kubernetes: 0, docker: 0, other: 0 }]
}

function incidentChart(incidents) {
  const severities = ['low', 'medium', 'high', 'critical']
  return severities.map((severity) => ({
    severity,
    open: incidents.filter((incident) => String(incident.severity || '').toLowerCase() === severity && incident.status !== 'resolved').length,
    resolved: incidents.filter((incident) => String(incident.severity || '').toLowerCase() === severity && incident.status === 'resolved').length,
  }))
}

function securityChart(scans) {
  const totals = scans.reduce((acc, scan) => {
    acc.critical += scan.critical_count || 0
    acc.high += scan.high_count || 0
    acc.medium += scan.medium_count || 0
    acc.low += scan.low_count || 0
    return acc
  }, { critical: 0, high: 0, medium: 0, low: 0 })
  return [
    { severity: 'critical', count: totals.critical },
    { severity: 'high', count: totals.high },
    { severity: 'medium', count: totals.medium },
    { severity: 'low', count: totals.low },
  ]
}

export default function Overview() {
  const [overview, setOverview] = useState(null)
  const [metricData, setMetricData] = useState(resourceUsageData)
  const [projects, setProjects] = useState([])
  const [incidents, setIncidents] = useState([])
  const [scans, setScans] = useState([])
  const [source, setSource] = useState('loading')

  useEffect(() => {
    async function loadOverview() {
      try {
        const [overviewResponse, cpuResponse, memoryResponse, requestResponse, projectResponse, incidentResponse, scanResponse] = await Promise.all([
          api.get('/monitoring/overview'),
          api.get('/monitoring/cpu'),
          api.get('/monitoring/memory'),
          api.get('/monitoring/request-rate'),
          api.get('/projects'),
          api.get('/incidents'),
          api.get('/security/scans'),
        ])
        const nextOverview = unwrap(overviewResponse)
        setOverview(nextOverview)
        setMetricData(normalizeMetricSeries(unwrap(cpuResponse).data || [], unwrap(memoryResponse).data || [], unwrap(requestResponse).data || []))
        setProjects(unwrap(projectResponse) || [])
        setIncidents(unwrap(incidentResponse) || [])
        setScans(unwrap(scanResponse) || [])
        setSource(nextOverview?.mode || 'api')
      } catch {
        setMetricData(resourceUsageData)
        setSource('fallback')
      }
    }
    loadOverview()
  }, [])

  const openIncidents = incidents.filter((incident) => incident.status !== 'resolved')
  const failedScans = scans.filter((scan) => scan.status !== 'completed')
  const securityIssues = scans.reduce((total, scan) => total + (scan.critical_count || 0) + (scan.high_count || 0) + (scan.medium_count || 0) + (scan.low_count || 0), 0)
  const latestProject = projects[0]
  const summaryCards = [
    { label: 'Projects', value: projects.length, delta: latestProject ? `Latest: ${latestProject.name}` : 'No projects yet' },
    { label: 'Deploy Targets', value: new Set(projects.map((project) => project.deployment_type).filter(Boolean)).size, delta: 'From saved projects' },
    { label: 'Open Incidents', value: openIncidents.length, delta: `${incidents.length} total incidents` },
    { label: 'Active Alerts', value: overview?.active_alerts ?? 0, delta: `Source: ${source}` },
    { label: 'Security Issues', value: securityIssues, delta: `${failedScans.length} incomplete scans` },
    { label: 'CPU Usage', value: `${overview?.cpu_usage ?? 0}%`, delta: 'Monitoring overview' },
    { label: 'Memory Usage', value: `${overview?.memory_usage ?? 0}%`, delta: 'Monitoring overview' },
    { label: 'API Latency', value: `${overview?.api_latency_ms ?? 0}ms`, delta: `${overview?.request_rate ?? 0} req/min` },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-cyan-300">Platform overview</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">DevOps control plane</h1>
        <p className="mt-2 text-sm text-slate-400">Live summary from projects, monitoring, incidents, and security scans.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => {
          const Icon = icons[index]
          return (
            <Card key={card.label} hover>
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">{card.label}</p>
                    <p className="mt-2 text-3xl font-bold text-white">{card.value}</p>
                    <p className="mt-2 text-xs text-slate-500">{card.delta}</p>
                  </div>
                  <div className="rounded-md border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-200">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">
        Data source: {source}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Projects by Deployment Target" description="Saved project deployment types by environment">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deploymentChart(projects)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="group" />
              <YAxis />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Bar dataKey="gitops" stackId="deploy" fill="#22d3ee" radius={[0, 0, 4, 4]} />
              <Bar dataKey="kubernetes" stackId="deploy" fill="#38bdf8" />
              <Bar dataKey="docker" stackId="deploy" fill="#a78bfa" />
              <Bar dataKey="other" stackId="deploy" fill="#64748b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="CPU and Memory Usage" description="Cluster averages across production workloads">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Area type="monotone" dataKey="cpu" stroke="#38bdf8" fill="#38bdf833" />
              <Area type="monotone" dataKey="memory" stroke="#a78bfa" fill="#a78bfa33" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Incidents by Severity" description="Open versus resolved incidents">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={incidentChart(incidents)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="severity" />
              <YAxis />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Bar dataKey="open" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="resolved" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Security Findings" description="Findings from recorded security scans">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={securityChart(scans)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="severity" />
              <YAxis />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Line dataKey="count" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
