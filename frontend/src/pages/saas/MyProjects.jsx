import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { deleteProject, downloadProject, projectsForUser } from '../../utils/generator'
import { api, apiErrorMessage, unwrap } from '../../services/api'

function fromBackendProject(project) {
  const title = project.name.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  return {
    id: `backend-${project.id}`,
    backendProjectId: project.id,
    title,
    projectType: project.deployment_type,
    difficulty: 'Intermediate',
    createdAt: project.created_at,
    downloads: { zip: 0, pdf: 0 },
  }
}

export default function MyProjects({ user }) {
  const [projects, setProjects] = useState(() => projectsForUser(user))
  const [message, setMessage] = useState('')

  const loadProjects = useCallback(async () => {
    try {
      setProjects((unwrap(await api.get('/projects')) || []).map(fromBackendProject))
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not load backend projects. Showing local project history.'))
      setProjects(projectsForUser(user))
    }
  }, [user])

  useEffect(() => {
    if (user) {
      queueMicrotask(() => {
        loadProjects()
      })
    }
  }, [loadProjects, user])

  async function remove(project) {
    if (project.backendProjectId) {
      await api.delete(`/projects/${project.backendProjectId}`)
      await loadProjects()
      return
    }
    deleteProject(project.id)
    setProjects(projectsForUser(user))
  }

  async function download(project, format) {
    await downloadProject(project, format)
    await loadProjects()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">My Projects</h1>
          <p className="mt-2 text-slate-400">Your saved generation history and downloads.</p>
        </div>
        <Link to="/generate"><Button>Generate Project</Button></Link>
      </div>
      {message ? <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</div> : null}
      {projects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} hover>
              <CardContent>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge tone="cyan">{project.projectType}</Badge>
                  <Badge tone="purple">{project.difficulty}</Badge>
                </div>
                <h2 className="text-lg font-semibold text-white">{project.title}</h2>
                <p className="mt-2 text-sm text-slate-400">Created {new Date(project.createdAt).toLocaleDateString()}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link to={`/result/${project.id}`}><Button size="sm">View</Button></Link>
                  <Button size="sm" variant="secondary" icon={Download} onClick={() => download(project, 'zip')}>ZIP</Button>
                  <Button size="sm" variant="secondary" onClick={() => download(project, 'pdf')}>PDF</Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => remove(project)}>Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center">
            <p className="text-white">No saved projects yet.</p>
            <p className="mt-2 text-sm text-slate-400">Generate a project to start building your OpsForge history.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
