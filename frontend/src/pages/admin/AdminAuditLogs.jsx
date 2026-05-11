import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { Table } from '../../components/ui/Table'
import { auditLogs } from '../../data/mockData'
import { api, unwrap } from '../../services/api'

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState(auditLogs)

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
      } catch {
        setLogs(auditLogs)
      }
    }
    loadLogs()
  }, [])

  return (
    <Card>
      <CardHeader title="Audit Logs" description="Sensitive platform actions: login, project creation, deployments, scans, AI analysis, keys, clusters, and role updates." />
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
        />
      </CardContent>
    </Card>
  )
}
