import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { api, apiErrorMessage, unwrap } from '../../services/api'

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [message, setMessage] = useState('')

  async function loadUsers() {
    try {
      setUsers(unwrap(await api.get('/admin/users')) || [])
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Admin API unavailable.'))
    }
  }

  async function disableUser(userId) {
    try {
      await api.patch(`/admin/users/${userId}/disable`)
      await loadUsers()
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not disable user.'))
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadUsers)
  }, [])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-3xl font-bold text-white">User Management</h1>
      {message ? <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</div> : null}
      <Card>
        <CardHeader title="Users" description="View platform users and disable accounts when needed." />
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-3">Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-4 text-white">{user.name}</td>
                    <td className="text-slate-300">{user.email}</td>
                    <td><Badge tone={user.role === 'ADMIN' ? 'purple' : 'cyan'}>{user.role}</Badge></td>
                    <td><Badge tone={user.is_active ? 'green' : 'rose'}>{user.is_active ? 'Active' : 'Disabled'}</Badge></td>
                    <td className="text-slate-400">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                    <td className="text-right"><Button size="sm" variant="danger" onClick={() => disableUser(user.id)}>Disable</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users.length ? <p className="p-6 text-center text-sm text-slate-400">No users loaded.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
