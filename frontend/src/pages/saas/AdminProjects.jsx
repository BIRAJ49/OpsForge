import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { deleteProject, getProjects } from '../../utils/generator'

export default function AdminProjects() {
  const [projects, setProjects] = useState(() => getProjects())

  function remove(projectId) {
    deleteProject(projectId)
    setProjects(getProjects())
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-3xl font-bold text-white">All Generated Projects</h1>
      <Card>
        <CardHeader title="Project history" description="Platform-wide generated project telemetry from the frontend generator." />
        <CardContent>
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge tone="cyan">{project.projectType}</Badge>
                    <Badge tone="purple">{project.difficulty}</Badge>
                  </div>
                  <p className="font-medium text-white">{project.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{project.owner} · {new Date(project.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/result/${project.id}`}><Button size="sm" variant="secondary">View</Button></Link>
                  <Button size="sm" variant="danger" onClick={() => remove(project.id)}>Delete</Button>
                </div>
              </div>
            ))}
            {!projects.length ? <p className="text-sm text-slate-400">No projects generated yet.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
