import { Bot, CheckCircle2, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { incidents } from '../data/mockData'
import { api, unwrap } from '../services/api'

export default function Incidents() {
  const [rows, setRows] = useState(incidents)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadIncidents() {
      try {
        const data = unwrap(await api.get('/incidents'))
        setRows(data.map((incident) => ({
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          service: incident.affected_service,
          status: incident.status,
          rootCause: incident.root_cause_summary || 'No root cause recorded yet.',
          created: new Date(incident.created_at).toLocaleString(),
        })))
      } catch (error) {
        setMessage(error.response?.data?.message || 'Could not load incidents')
      }
    }
    loadIncidents()
  }, [])

  async function action(incident, endpoint) {
    try {
      const result = unwrap(await api.post(`/incidents/${incident.id}/${endpoint}`))
      setMessage(endpoint === 'analyze' ? result.root_cause : `${endpoint} requested`)
    } catch (error) {
      setMessage(error.response?.data?.message || `Could not ${endpoint} incident`)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Incidents</h1>
        <p className="mt-1 text-sm text-slate-400">AI-assisted incident response, rollback, and resolution workflows.</p>
      </div>
      {message ? <div className="rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
      <div className="grid gap-4 xl:grid-cols-3">
        {rows.map((incident) => (
          <Card key={incident.title} hover>
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">{incident.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{incident.created}</p>
                </div>
                <StatusBadge status={incident.severity} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge status={incident.status} />
                <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{incident.service}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">{incident.rootCause}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="sm" icon={Bot} onClick={() => action(incident, 'analyze')} disabled={!incident.id}>Analyze with AI</Button>
                <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => action(incident, 'resolve')} disabled={!incident.id}>Resolve</Button>
                <Button size="sm" variant="warning" icon={RotateCcw} onClick={() => action(incident, 'rollback')} disabled={!incident.id}>Rollback</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
