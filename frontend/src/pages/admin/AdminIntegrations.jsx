import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Table } from '../../components/ui/Table'
import { integrations } from '../../data/mockData'

export default function AdminIntegrations() {
  return (
    <Card>
      <CardHeader title="Integrations" description="SCM, registry, incident response, and notification integrations." />
      <CardContent>
        <Table
          columns={[
            { key: 'name', header: 'Integration', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
            { key: 'type', header: 'Type' },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            { key: 'owner', header: 'Owner' },
            { key: 'updated', header: 'Updated' },
          ]}
          data={integrations}
        />
      </CardContent>
    </Card>
  )
}
