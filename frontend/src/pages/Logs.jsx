import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { logs } from '../data/mockData'
import { api, unwrap } from '../services/api'

const severityTone = {
  Info: 'blue',
  Warning: 'amber',
  Error: 'rose',
  Critical: 'rose',
  INFO: 'blue',
  WARNING: 'amber',
  ERROR: 'rose',
  CRITICAL: 'rose',
}

export default function Logs() {
  const [rows, setRows] = useState(logs)
  const [services, setServices] = useState(['billing-api', 'checkout-service', 'api-gateway'])
  const [filters, setFilters] = useState({ service: '', severity: '', search: '' })

  useEffect(() => {
    async function loadServices() {
      try {
        setServices(unwrap(await api.get('/logs/services')))
      } catch {
        setServices(['billing-api', 'checkout-service', 'api-gateway'])
      }
    }
    loadServices()
  }, [])

  useEffect(() => {
    async function loadLogs() {
      try {
        const params = new URLSearchParams()
        if (filters.service) params.set('service', filters.service)
        if (filters.severity) params.set('severity', filters.severity)
        if (filters.search) params.set('search', filters.search)
        const data = unwrap(await api.get(`/logs?${params.toString()}`))
        setRows(data)
      } catch {
        setRows(logs)
      }
    }
    loadLogs()
  }, [filters])

  return (
    <Card>
      <CardHeader title="Logs" description="Terminal-style log stream with service and severity filters." />
      <CardContent>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-400" placeholder="Search logs" />
          </label>
          <select value={filters.service} onChange={(event) => setFilters((value) => ({ ...value, service: event.target.value }))} className="h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400">
            <option value="">All services</option>
            {services.map((service) => <option key={service} value={service}>{service}</option>)}
          </select>
          <select value={filters.severity} onChange={(event) => setFilters((value) => ({ ...value, severity: event.target.value }))} className="h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400">
            <option value="">All severities</option>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="ERROR">Error</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
        <div className="mt-5 overflow-hidden rounded-lg border border-slate-800 bg-[#050816] font-mono text-sm">
          {rows.map((log) => (
            <div key={`${log.timestamp}-${log.message}`} className="grid gap-3 border-b border-slate-900 px-4 py-3 last:border-b-0 lg:grid-cols-[230px_160px_110px_1fr]">
              <span className="text-slate-500">{log.timestamp}</span>
              <span className="text-cyan-200">{log.service}</span>
              <Badge tone={severityTone[log.severity]}>{log.severity}</Badge>
              <span className="text-slate-300">{log.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
