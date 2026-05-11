import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, AlertTriangle, Cpu, Database, FolderGit2, Rocket, ShieldCheck, Timer } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { ChartCard } from '../components/ui/ChartCard'
import {
  deploymentSuccessData,
  incidentTrendData,
  resourceUsageData,
  serviceHealth,
  summaryCards,
} from '../data/mockData'

const icons = [FolderGit2, Rocket, AlertTriangle, Activity, ShieldCheck, Cpu, Database, Timer]
const colors = ['#22d3ee', '#38bdf8', '#a78bfa', '#10b981']

export default function Overview() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-cyan-300">Platform overview</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">DevOps control plane</h1>
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

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Deployment Success Rate" description="Success versus failed releases">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deploymentSuccessData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Bar dataKey="success" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failed" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="CPU and Memory Usage" description="Cluster averages across production workloads">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={resourceUsageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Area type="monotone" dataKey="cpu" stroke="#38bdf8" fill="#38bdf833" />
              <Area type="monotone" dataKey="memory" stroke="#a78bfa" fill="#a78bfa33" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Incident Trend" description="Weekly incident volume by severity">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={incidentTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Bar dataKey="low" stackId="a" fill="#60a5fa" radius={[0, 0, 4, 4]} />
              <Bar dataKey="medium" stackId="a" fill="#f59e0b" />
              <Bar dataKey="high" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Service Health Status" description="Availability score by core service">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={serviceHealth} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={4}>
                {serviceHealth.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
