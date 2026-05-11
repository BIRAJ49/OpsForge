import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { api, apiErrorMessage, unwrap } from '../../services/api'
import { getGuestCount } from '../../utils/generator'

export default function SystemUsage() {
  const [usage, setUsage] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadUsage() {
      try {
        setUsage(unwrap(await api.get('/admin/system-usage')))
      } catch (error) {
        setMessage(apiErrorMessage(error, 'Could not load backend usage. Showing local guest usage.'))
      }
    }
    loadUsage()
  }, [])

  const guestGenerations = usage?.guest_generations ?? getGuestCount()
  const registeredGenerations = usage?.registered_generations ?? 0
  const totalDownloads = usage?.total_downloads ?? 0
  const rows = usage?.suspicious_usage ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-3xl font-bold text-white">System Usage</h1>
      {message ? <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</div> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent><p className="text-sm text-slate-400">Guest generations</p><p className="mt-2 text-2xl font-bold text-white">{guestGenerations}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-slate-400">Registered generations</p><p className="mt-2 text-2xl font-bold text-white">{registeredGenerations}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-slate-400">Total downloads</p><p className="mt-2 text-2xl font-bold text-white">{totalDownloads}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader title="Usage monitor" description="Backend usage signals ordered by download volume." />
        <CardContent className="space-y-3">
          {rows.map((row) => (
            <div key={row.project_id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div>
                <p className="text-white">{row.project_name}</p>
                <p className="mt-1 text-xs text-slate-500">Owner ID: {row.owner_id}</p>
              </div>
              <Badge tone={row.downloads > 5 ? 'amber' : 'slate'}>{row.downloads} downloads</Badge>
            </div>
          ))}
          {!rows.length ? <p className="text-sm text-slate-400">No usage data yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
