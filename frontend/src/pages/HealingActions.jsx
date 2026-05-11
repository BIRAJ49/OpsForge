import { useState } from 'react'
import { Activity, CheckCircle2, Play, RotateCcw, Search } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { api, unwrap } from '../services/api'

const actionTypes = [
  'restart deployment',
  'scale deployment',
  'rollback deployment',
  'collect logs',
  'create incident',
  'mark resolved',
]

export default function HealingActions() {
  const [signal, setSignal] = useState('CrashLoopBackOff detected in backend deployment after latest rollout')
  const [actionType, setActionType] = useState('restart deployment')
  const [action, setAction] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function analyzeSignal() {
    setLoading(true)
    setMessage('')
    try {
      setAnalysis(unwrap(await api.post('/healing/analyze', { signal })))
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not analyze healing signal')
    } finally {
      setLoading(false)
    }
  }

  async function requestAction() {
    setLoading(true)
    setMessage('')
    try {
      const requested = unwrap(await api.post('/healing/actions', {
        action_type: actionType,
        parameters: actionType === 'scale deployment' ? { replicas: 3 } : {},
      }))
      setAction(requested)
      setMessage('Healing action requested and recorded in audit logs.')
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not request healing action')
    } finally {
      setLoading(false)
    }
  }

  async function executeAction() {
    if (!action?.id) return
    setLoading(true)
    setMessage('')
    try {
      setAction(unwrap(await api.post(`/healing/actions/${action.id}/execute`)))
      setMessage('Healing action executed.')
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not execute healing action')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader title="Self-Healing Actions" description="Controlled restart, scale, rollback, log collection, and incident actions with manual approval mode." />
        <CardContent className="space-y-5">
          {message ? <div className="rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Incident or deployment signal</span>
            <textarea
              value={signal}
              onChange={(event) => setSignal(event.target.value)}
              rows={5}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 outline-none focus:border-cyan-400"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button icon={Search} onClick={analyzeSignal} disabled={loading}>Analyze Signal</Button>
            <select value={actionType} onChange={(event) => setActionType(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400">
              {actionTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <Button variant="secondary" icon={RotateCcw} onClick={requestAction} disabled={loading}>Request Action</Button>
            <Button variant="warning" icon={Play} onClick={executeAction} disabled={loading || !action?.id}>Execute</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Analysis Result" />
          <CardContent>
            {analysis ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-400">Action</span><Badge tone="cyan">{analysis.recommended_action || 'manual review'}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-slate-400">Risk</span><Badge tone={analysis.risk === 'high' ? 'rose' : 'amber'}>{analysis.risk || 'medium'}</Badge></div>
                <p className="leading-6 text-slate-300">{analysis.reason || analysis.message || 'Review the signal and choose a controlled action.'}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Run an analysis to get a recommended controlled action.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Current Action" />
          <CardContent>
            {action ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-300" /><span className="text-slate-100">{action.action_type}</span></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><Badge tone="purple">{action.status}</Badge></div>
                <pre className="custom-scrollbar overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(action.result || action.parameters || {}, null, 2)}</pre>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No action requested yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
