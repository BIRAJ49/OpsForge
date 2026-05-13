import { AlertCircle, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { logs } from '../data/mockData'
import { api, apiErrorMessage, unwrap } from '../services/api'

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
  const [filters, setFilters] = useState({ namespace: 'opsforge-system', service: '', severity: '', search: '' })
  const [meta, setMeta] = useState({ mode: 'mock', error: null })
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadServices() {
      try {
        const params = new URLSearchParams()
        if (filters.namespace) params.set('namespace', filters.namespace)
        setServices(unwrap(await api.get(`/logs/services?${params.toString()}`)))
      } catch {
        setServices(['billing-api', 'checkout-service', 'api-gateway'])
      }
    }
    loadServices()
  }, [filters.namespace])

  useEffect(() => {
    async function loadLogs() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        if (filters.namespace) params.set('namespace', filters.namespace)
        if (filters.service) params.set('service', filters.service)
        if (filters.severity) params.set('severity', filters.severity)
        if (filters.search) params.set('search', filters.search)
        params.set('limit', '500')
        const data = unwrap(await api.get(`/logs?${params.toString()}`))
        if (Array.isArray(data)) {
          setRows(data)
          setMeta({ mode: 'mock', error: null })
        } else {
          setRows(data.rows || [])
          setMeta({ mode: data.mode || 'unknown', error: data.error || null })
        }
      } catch (requestError) {
        setError(apiErrorMessage(requestError, 'Could not load logs'))
        setRows(logs)
        setMeta({ mode: 'mock_fallback', error: null })
      } finally {
        setLoading(false)
      }
    }
    loadLogs()
  }, [filters, refreshKey])

  return (
    <Card>
      <CardHeader
        title="Logs"
        description="Cluster log stream from Loki with namespace, service, severity, and text filters."
        action={
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={loading} onClick={() => setRefreshKey((value) => value + 1)}>
            Refresh
          </Button>
        }
      />
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={meta.mode === 'loki' ? 'green' : 'amber'}>{meta.mode === 'loki' ? 'Loki connected' : meta.mode}</Badge>
          <span className="text-xs text-slate-500">{rows.length} lines loaded</span>
        </div>
        {meta.error || error ? (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error || `Using fallback logs: ${meta.error}`}</span>
          </div>
        ) : null}
        <div className="grid gap-3 xl:grid-cols-[1fr_190px_190px_180px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-400" placeholder="Search logs" />
          </label>
          <select value={filters.namespace} onChange={(event) => setFilters((value) => ({ ...value, namespace: event.target.value, service: '' }))} className="h-11 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400">
            <option value="opsforge-system">opsforge-system</option>
            <option value="opsforge-prod">opsforge-prod</option>
            <option value="argocd">argocd</option>
            <option value="monitoring">monitoring</option>
          </select>
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
          {loading ? (
            <div className="flex items-center gap-3 px-4 py-8 text-cyan-100">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
              Loading logs
            </div>
          ) : rows.length ? (
            rows.map((log) => (
              <div key={`${log.timestamp}-${log.service}-${log.message}`} className="border-b border-slate-900 px-4 py-3 last:border-b-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">{log.timestamp}</span>
                  <span className="text-xs text-cyan-200">{log.service}</span>
                  {log.pod ? <span className="text-xs text-slate-500">{log.pod}</span> : null}
                  <Badge tone={severityTone[log.severity]}>{log.severity}</Badge>
                </div>
                <pre className="whitespace-pre-wrap break-words text-slate-300">{log.message}</pre>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-slate-400">No logs found for the selected filters.</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
