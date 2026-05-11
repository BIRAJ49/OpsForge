import { UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Table } from '../../components/ui/Table'
import { platformUsers } from '../../data/mockData'
import { api, unwrap } from '../../services/api'

export default function AdminUsers() {
  const [users, setUsers] = useState(platformUsers)

  useEffect(() => {
    async function loadUsers() {
      try {
        const data = unwrap(await api.get('/admin/users'))
        setUsers(data.map((user) => ({
          ...user,
          team: user.role === 'ADMIN' ? 'Platform' : 'User',
          status: user.is_active ? 'Active' : 'Disabled',
          lastLogin: user.is_verified ? 'Verified' : 'Unverified',
        })))
      } catch {
        setUsers(platformUsers)
      }
    }
    loadUsers()
  }, [])

  return (
    <Card>
      <CardHeader title="Users" description="Manage platform users, teams, and account status." action={<Button icon={UserPlus}>Invite User</Button>} />
      <CardContent>
        <Table
          columns={[
            { key: 'name', header: 'User', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
            { key: 'email', header: 'Email' },
            { key: 'role', header: 'Role' },
            { key: 'team', header: 'Team' },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            { key: 'lastLogin', header: 'Last login' },
          ]}
          data={users}
        />
      </CardContent>
    </Card>
  )
}
