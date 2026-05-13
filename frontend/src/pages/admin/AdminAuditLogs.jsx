import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { Table } from '../../components/ui/Table'
import { api, apiErrorMessage, unwrap } from '../../services/api'

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadLogs() {
      try {
        const data = unwrap(await api.get('/admin/audit-logs'))
        setLogs(data.map((log) => ({
          time: new Date(log.created_at).toLocaleString(),
          actor: log.user_id ? `User ${log.user_id}` : 'system',
          action: log.action,
          target: `${log.resource_type || 'resource'} ${log.resource_id || ''}`,
          result: log.status,
          ip: log.ip_address || 'unknown',
        })))
      } catch (error) {
        setMessage(apiErrorMessage(error, 'Could not load audit logs.'))
      }
    }
    loadLogs()
  }, [])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-3xl font-bold text-white">Audit Logs</h1>
      {message ? <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</div> : null}
      <Card>
        <CardHeader title="Audit Events" description="Sensitive platform actions including login, user management, GitHub connection, GitOps, scans, and healing actions." />
        <CardContent>
          <Table
            columns={[
              { key: 'time', header: 'Timestamp' },
              { key: 'actor', header: 'Actor', render: (row) => <span className="font-medium text-slate-100">{row.actor}</span> },
              { key: 'action', header: 'Action' },
              { key: 'target', header: 'Target' },
              { key: 'result', header: 'Result' },
              { key: 'ip', header: 'IP' },
            ]}
            data={logs}
            emptyMessage="No audit logs found."
          />
        </CardContent>
      </Card>
    </div>
  )
}
