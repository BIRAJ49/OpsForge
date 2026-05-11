import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Table } from '../../components/ui/Table'
import { systemHealth } from '../../data/mockData'

export default function AdminSystemHealth() {
  return (
    <Card>
      <CardHeader title="System Health" description="OpsForge control plane service availability and latency." />
      <CardContent>
        <Table
          columns={[
            { key: 'service', header: 'Service', render: (row) => <span className="font-medium text-slate-100">{row.service}</span> },
            { key: 'uptime', header: 'Uptime' },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            { key: 'latency', header: 'Latency' },
          ]}
          data={systemHealth}
        />
      </CardContent>
    </Card>
  )
}
