import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Eye, FileCode2, GitBranch, Plus, Rocket } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { projects } from '../data/mockData'
import { api, unwrap } from '../services/api'

export default function Projects({ user, onLoginClick }) {
  const [rows, setRows] = useState(projects)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadProjects() {
      if (!user) {
        setRows(projects)
        return
      }
      setLoading(true)
      try {
        const data = unwrap(await api.get('/projects'))
        setRows(data.map((project) => ({
          id: project.id,
          name: project.name,
          stack: project.stack,
          environment: project.environment,
          deploymentType: project.deployment_type,
          status: 'Healthy',
          updated: new Date(project.updated_at).toLocaleString(),
        })))
      } catch (error) {
        setMessage(error.response?.data?.message || 'Could not load backend projects')
      } finally {
        setLoading(false)
      }
    }
    loadProjects()
  }, [user])

  const requireAuth = (event) => {
    if (!user) {
      event.preventDefault()
      onLoginClick?.()
      return false
    }
    return true
  }

  const generateFiles = async (event, row) => {
    if (!requireAuth(event)) return
    if (!row.id) return
    setMessage('')
    try {
      await api.post(`/projects/${row.id}/generate`)
      localStorage.setItem('opsforge_last_project_id', row.id)
    } catch (error) {
      event.preventDefault()
      setMessage(error.response?.data?.message || 'Could not generate files')
    }
  }

  const deployProject = async (row) => {
    if (!row.id) return
    setMessage('')
    try {
      await api.post(`/projects/${row.id}/deploy`, { image_tag: 'latest', replicas: 1 })
      setMessage(`Deployment workflow recorded for ${row.name}`)
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not trigger deployment')
    }
  }

  const pushToGitHub = async (row) => {
    if (!row.id) return
    setMessage('')
    try {
      await api.post(`/projects/${row.id}/github/create-repo`)
      await api.post(`/projects/${row.id}/github/push-generated-files`)
      setMessage(`Generated files pushed to GitHub for ${row.name}`)
    } catch (error) {
      setMessage(error.response?.data?.message || 'GitHub integration token is required before pushing files')
    }
  }

  const columns = [
    { key: 'name', header: 'Project name', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
    { key: 'stack', header: 'Stack' },
    { key: 'environment', header: 'Environment' },
    { key: 'deploymentType', header: 'Deployment type' },
    {
      key: 'quickActions',
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          <Link to={`/result/backend-${row.id}`} onClick={requireAuth}>
            <Button size="sm" variant="ghost" icon={Eye}>View</Button>
          </Link>
          <Button size="sm" variant="secondary" icon={Rocket} onClick={(event) => (requireAuth(event) ? deployProject(row) : null)}>Deploy</Button>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'updated', header: 'Last updated' },
    {
      key: 'files',
      header: 'Files',
      render: (row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={GitBranch} onClick={(event) => (requireAuth(event) ? pushToGitHub(row) : null)}>Push</Button>
          <Link to="/app/generated-files" onClick={(event) => generateFiles(event, row)}>
            <Button size="sm" variant="primary" icon={FileCode2}>Generate Files</Button>
          </Link>
        </div>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader
        title="Projects"
        description={user ? 'Your projects loaded from OpsForge API.' : 'Public preview. Login or register to create, deploy, or generate files.'}
        action={<Link to="/app/create-project" onClick={requireAuth}><Button icon={Plus}>Create Project</Button></Link>}
      />
      <CardContent>
        {message ? <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
        {loading ? <div className="py-8 text-center text-sm text-slate-400">Loading projects...</div> : <Table columns={columns} data={rows} />}
      </CardContent>
    </Card>
  )
}
