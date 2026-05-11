import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Table } from '../../components/ui/Table'
import { securityPolicies } from '../../data/mockData'

export default function AdminSecurityPolicies() {
  return (
    <Card>
      <CardHeader title="Security Policies" description="Platform policy guardrails for clusters, GitOps repos, and workloads." action={<Button>Create Policy</Button>} />
      <CardContent>
        <Table
          columns={[
            { key: 'name', header: 'Policy', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
            { key: 'scope', header: 'Scope' },
            { key: 'enforcement', header: 'Enforcement' },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            { key: 'violations', header: 'Violations' },
          ]}
          data={securityPolicies}
        />
      </CardContent>
    </Card>
  )
}
