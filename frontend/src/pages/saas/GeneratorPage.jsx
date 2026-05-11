import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, Boxes, Cloud, GitBranch, FileCode2, Gauge, HeartPulse } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { api, apiErrorMessage } from '../../services/api'
import {
  DIFFICULTIES,
  PROJECT_TYPES,
  generateProject,
  getGuestId,
  getGuestCount,
  guestLimitReached,
  incrementGuestCount,
  saveProject,
} from '../../utils/generator'

const deploymentMap = {
  Docker: 'docker',
  Kubernetes: 'kubernetes',
  'CI/CD': 'gitops',
  Terraform: 'gitops',
  'AWS Deployment': 'gitops',
  Monitoring: 'kubernetes',
  'Self-Healing DevOps': 'gitops',
}

const projectIcons = {
  Docker: Boxes,
  Kubernetes: Cloud,
  'CI/CD': GitBranch,
  Terraform: FileCode2,
  'AWS Deployment': Cloud,
  Monitoring: Gauge,
  'Self-Healing DevOps': HeartPulse,
}

export default function GeneratorPage({ user }) {
  const navigate = useNavigate()
  const [projectType, setProjectType] = useState('Kubernetes')
  const [difficulty, setDifficulty] = useState('Intermediate')
  const [requirement, setRequirement] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  async function createBackendProject(project) {
    if (!user) return project
    try {
      const created = await api.post('/projects', {
        name: project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        description: project.overview,
        app_type: 'fullstack',
        stack: 'React + FastAPI + PostgreSQL + Redis',
        deployment_type: deploymentMap[project.projectType] || 'gitops',
        environment: 'dev',
        monitoring_enabled: ['Monitoring', 'Self-Healing DevOps', 'Kubernetes'].includes(project.projectType),
        security_scan_enabled: true,
        ai_assistant_enabled: project.projectType === 'Self-Healing DevOps',
        auto_healing_enabled: project.projectType === 'Self-Healing DevOps',
      })
      const backendProjectId = created.data?.data?.id
      if (backendProjectId) {
        await api.post(`/projects/${backendProjectId}/generate`)
        return { ...project, backendProjectId }
      }
    } catch (error) {
      setNotice(apiErrorMessage(error, 'Saved locally. Backend generation will be available after API setup is complete.'))
    }
    return project
  }

  async function submit(event) {
    event.preventDefault()
    setNotice('')

    if (!user && guestLimitReached()) {
      setNotice('Guest generation limit reached. Login or create an account to continue.')
      return
    }

    setLoading(true)
    try {
      let project = generateProject({ projectType, difficulty, requirement, user })
      if (!user) {
        await api.post('/guest/usage/increment', {}, { headers: { 'X-Guest-Id': getGuestId() } })
        incrementGuestCount()
      }
      project = await createBackendProject(project)
      saveProject(project)
      navigate(`/result/${project.id}`)
    } catch (error) {
      setNotice(apiErrorMessage(error, 'Could not generate project. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const guestRemaining = Math.max(0, 3 - getGuestCount())

  return (
    <div className="mx-auto max-w-5xl">
      <Card className="bg-slate-950/80">
        <CardHeader
          title="Generate DevOps Project"
          description="Select a project type, choose a level, and generate a download-ready DevOps plan."
          action={<Badge tone={user ? 'green' : 'amber'}>{user ? 'Signed in' : `${guestRemaining} guest generations left`}</Badge>}
        />
        <CardContent>
          {notice ? (
            <div className="mb-5 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{notice}</div>
          ) : null}
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-3">
              <span className="text-sm font-medium text-slate-200">Project Type</span>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {PROJECT_TYPES.map((type) => {
                  const Icon = projectIcons[type]
                  const active = projectType === type
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setProjectType(type)}
                      className={`flex min-h-20 items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${active ? 'border-cyan-400 bg-cyan-400/10 shadow-lg shadow-cyan-950/20' : 'border-slate-800 bg-slate-900/70 hover:border-slate-600 hover:bg-slate-900'}`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-cyan-200' : 'text-slate-400'}`} />
                      <p className="text-sm font-semibold leading-5 text-white">{type}</p>
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="block space-y-3">
              <span className="text-sm font-medium text-slate-200">Difficulty Level</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(level)}
                    className={`h-10 rounded-md border text-sm font-medium transition ${difficulty === level ? 'border-purple-400 bg-purple-400/10 text-purple-100' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Custom requirement</span>
              <textarea
                rows={4}
                value={requirement}
                onChange={(event) => setRequirement(event.target.value)}
                placeholder="I want a Kubernetes project with monitoring and auto-healing."
                className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-3 text-slate-100 outline-none placeholder:text-slate-600 transition focus:border-cyan-400 focus:bg-slate-950"
              />
            </label>
            <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">
                {user ? 'Generated projects are saved to your account history.' : `${guestRemaining} of 3 guest generations remaining.`}
              </p>
              <Button className="h-11 px-6" icon={Wand2} loading={loading} disabled={loading}>{loading ? 'Generating...' : 'Generate Project'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
