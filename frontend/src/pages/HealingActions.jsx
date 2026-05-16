import { CheckCircle2, Clock, Play, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { api, apiErrorMessage, unwrap } from '../services/api'

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '-'
}

function actionTarget(action) {
  const params = action.parameters || {}
  if (params.namespace && params.pod_name) return `${params.namespace}/${params.pod_name}`
  if (action.project_id) return `Project #${action.project_id}`
  if (action.incident_id) return `Incident #${action.incident_id}`
  return 'Platform action'
}

function statusCounts(actions) {
  return actions.reduce((counts, action) => {
    counts[action.status] = (counts[action.status] || 0) + 1
    return counts
  }, {})
}

export default function HealingActions({ user }) {
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const loadActions = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      setRows(unwrap(await api.get('/healing/actions')) || [])
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not load healing actions'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadActions()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadActions])

  async function approveAction(action) {
    setMessage('')
    try {
      const approved = unwrap(await api.post(`/healing/actions/${action.id}/approve`))
      setRows((current) => current.map((item) => (item.id === approved.id ? approved : item)))
      setMessage(`Healing action #${approved.id} approved.`)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not approve healing action'))
    }
  }

  async function executeAction(action) {
    setMessage('')
    try {
      const executed = unwrap(await api.post(`/healing/actions/${action.id}/execute`))
      setRows((current) => current.map((item) => (item.id === executed.id ? executed : item)))
      setMessage(executed.result?.message || `Healing action #${executed.id} executed.`)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not execute healing action'))
    }
  }

  const counts = statusCounts(rows)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Healing Actions</h1>
          <p className="mt-1 text-sm text-slate-400">Review, approve, and execute controlled restart, rollback, scale, and incident response actions.</p>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={loadActions}>Refresh</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Requested', counts.requested || 0],
          ['Approved', counts.approved || 0],
          ['Executed', counts.executed || 0],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent>
              <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-white">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Requested Actions" description="Actions are recorded first. Production restart and rollback actions require admin approval." />
        <CardContent>
          {message ? <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          {loading ? <div className="py-8 text-center text-sm text-slate-400">Loading healing actions...</div> : null}
          {!loading && !rows.length ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-10 text-center text-sm text-slate-500">
              No healing actions recorded yet.
            </div>
          ) : null}
          {!loading && rows.length ? (
            <div className="grid gap-4">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-xs text-slate-300">#{row.id}</span>
                        <StatusBadge status={row.status} />
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" />{formatDate(row.created_at)}</span>
                      </div>
                      <div>
                        <h2 className="text-base font-semibold capitalize text-white">{row.action_type}</h2>
                        <p className="mt-1 font-mono text-sm text-cyan-100">{actionTarget(row)}</p>
                      </div>
                      <div className="grid gap-2 text-sm text-slate-400 lg:grid-cols-2">
                        {row.parameters?.status ? <p><span className="text-slate-200">Detected status:</span> {row.parameters.status}</p> : null}
                        {row.incident_id ? <p><span className="text-slate-200">Incident:</span> #{row.incident_id}</p> : null}
                        {row.project_id ? <p><span className="text-slate-200">Project:</span> #{row.project_id}</p> : null}
                        {row.executed_at ? <p><span className="text-slate-200">Executed:</span> {formatDate(row.executed_at)}</p> : null}
                      </div>
                      {row.parameters?.evidence_command ? (
                        <pre className="custom-scrollbar max-w-full overflow-auto rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-cyan-100">{row.parameters.evidence_command}</pre>
                      ) : null}
                      {row.result?.message ? (
                        <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{row.result.message}</div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                      {user?.role === 'ADMIN' && row.status === 'requested' ? (
                        <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => approveAction(row)}>Approve</Button>
                      ) : null}
                      {row.status !== 'executed' ? (
                        <Button size="sm" icon={Play} onClick={() => executeAction(row)}>Execute</Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
