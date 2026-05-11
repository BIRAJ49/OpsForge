import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Table } from '../../components/ui/Table'
import { clusters } from '../../data/mockData'

export default function AdminClusters() {
  return (
    <Card>
      <CardHeader title="Kubernetes Clusters" description="Registered clusters, providers, versions, nodes, and operating cost." />
      <CardContent>
        <Table
          columns={[
            { key: 'name', header: 'Cluster', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
            { key: 'provider', header: 'Provider' },
            { key: 'version', header: 'Version' },
            { key: 'nodes', header: 'Nodes' },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            { key: 'cost', header: 'Cost' },
          ]}
          data={clusters}
        />
      </CardContent>
    </Card>
  )
}
