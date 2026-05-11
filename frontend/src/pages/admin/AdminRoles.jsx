import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { Table } from '../../components/ui/Table'
import { rolePermissions } from '../../data/mockData'

export default function AdminRoles() {
  return (
    <Card>
      <CardHeader title="Roles" description="Role-based access levels for user and admin dashboards." />
      <CardContent>
        <Table
          columns={[
            { key: 'role', header: 'Role', render: (row) => <span className="font-medium text-slate-100">{row.role}</span> },
            { key: 'scope', header: 'Scope' },
            { key: 'permissions', header: 'Permissions' },
          ]}
          data={rolePermissions}
        />
      </CardContent>
    </Card>
  )
}
