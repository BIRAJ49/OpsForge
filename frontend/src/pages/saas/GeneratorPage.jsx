import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, BrainCircuit, Boxes, CheckCircle2, Cloud, FileCode2, Gauge, GitBranch, HeartPulse, Layers3, Sparkles } from 'lucide-react'
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

const templateDetails = {
  Docker: [Boxes, 'Container runtime, compose, env examples'],
  Kubernetes: [Cloud, 'Deployments, services, ingress, rollout steps'],
  'CI/CD': [GitBranch, 'GitHub Actions, validation, release flow'],
  Terraform: [FileCode2, 'Provider, variables, infrastructure plan'],
  'AWS Deployment': [Cloud, 'EC2, IAM, networking, security placeholders'],
  Monitoring: [Gauge, 'Metrics, dashboards, alerts, checks'],
  'Self-Healing DevOps': [HeartPulse, 'Health checks, rollback, recovery notes'],
}

export default function GeneratorPage({ user }) {
  const navigate = useNavigate()
  const [projectType, setProjectType] = useState('Kubernetes')
  const [difficulty, setDifficulty] = useState('Intermediate')
  const [generationMode, setGenerationMode] = useState('ai')
  const [requirement, setRequirement] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  async function createBackendProject(project) {
    if (!user) return project
    try {
      const created = await api.post('/projects', {
        name: project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        description: project.requirement,
        app_type: 'fullstack',
        stack: project.tools.join(' + '),
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
    if (generationMode === 'ai' && !requirement.trim()) {
      setNotice('Describe what you want to build first. OpsForge will infer the stack, features, files, and steps from that description.')
      return
    }

    if (!user && guestLimitReached()) {
      setNotice('Guest generation limit reached. Login or create an account to continue.')
      return
    }

    setLoading(true)
    try {
      let project = generateProject({ projectType, difficulty, requirement, user, generationMode })
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
  const examples = [
    'Build a React and FastAPI SaaS dashboard with login, PostgreSQL, Redis queues, Docker, GitHub Actions, and Kubernetes deployment.',
    'Create an AWS deployment project for a backend API using Terraform, EC2, security groups, CI/CD, monitoring, and rollback steps.',
    'Generate a self-healing Kubernetes project with Prometheus alerts, health checks, HPA, incident notes, and GitOps deployment files.',
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Card className="overflow-hidden bg-slate-950/80">
        <CardHeader
          title="Describe Your Project"
          description="OpsForge will infer the features, stack, deployment path, implementation steps, and generated files from your prompt."
          action={<Badge tone={user ? 'green' : 'amber'}>{user ? 'Signed in' : `${guestRemaining} guest generations left`}</Badge>}
        />
        <CardContent>
          {notice ? (
            <div className="mb-5 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{notice}</div>
          ) : null}
          <form className="space-y-6" onSubmit={submit}>
            <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2 sm:grid-cols-2">
              {[
                ['ai', BrainCircuit, 'Analyze description', 'Infer features, stack, steps, and files from what the user writes.'],
                ['template', Layers3, 'Use template', 'Generate from a selected default template without prompt inference.'],
              ].map(([mode, Icon, title, text]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGenerationMode(mode)}
                  className={`flex gap-3 rounded-md border p-4 text-left transition ${generationMode === mode ? 'border-cyan-400 bg-cyan-400/10 shadow-lg shadow-cyan-950/20' : 'border-transparent bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/70'}`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${generationMode === mode ? 'text-cyan-200' : 'text-slate-500'}`} />
                  <span>
                    <span className="block text-sm font-semibold text-white">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">{text}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className={generationMode === 'template' ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid gap-6'}>
              <div className="space-y-5">
                <label className="block space-y-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <BrainCircuit className="h-4 w-4 text-cyan-300" />
                    {generationMode === 'template' ? 'Optional project context' : 'Describe the project'}
                  </span>
                  <textarea
                    rows={generationMode === 'template' ? 5 : 9}
                    value={requirement}
                    onChange={(event) => setRequirement(event.target.value)}
                    placeholder={generationMode === 'template'
                      ? `Optional: add a project name or context for the ${projectType} template.`
                      : 'Example: Build a React and FastAPI SaaS dashboard with login, PostgreSQL, Redis queues, Docker, GitHub Actions, and Kubernetes deployment.'}
                    className="custom-scrollbar w-full resize-none rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-4 text-sm leading-7 text-slate-100 outline-none placeholder:text-slate-600 transition focus:border-cyan-400 focus:bg-slate-950"
                  />
                  <span className="block text-xs leading-5 text-slate-500">
                    {generationMode === 'template'
                      ? 'Template mode ignores this text for feature selection; it only keeps it as context in the generated result.'
                      : 'AI mode analyzes this description to decide features, tools, files, and implementation steps.'}
                  </span>
                </label>

                {generationMode === 'ai' ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        [Sparkles, 'Features', 'Detect what the app should do.'],
                        [FileCode2, 'Files', 'Generate code, config, and docs.'],
                        [GitBranch, 'Steps', 'Create a release path.'],
                      ].map(([Icon, title, text]) => (
                        <div key={title} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                          <Icon className="h-5 w-5 text-cyan-300" />
                          <p className="mt-3 text-sm font-semibold text-white">{title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-400">{text}</p>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-200">Prompt examples</p>
                      <div className="grid gap-2">
                        {examples.map((example) => (
                          <button
                            key={example}
                            type="button"
                            onClick={() => {
                              setGenerationMode('ai')
                              setRequirement(example)
                            }}
                            className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-left text-sm leading-6 text-slate-300 transition hover:border-cyan-400/50 hover:text-white"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PROJECT_TYPES.map((type) => {
                      const [Icon, description] = templateDetails[type]
                      const active = projectType === type
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setProjectType(type)}
                          className={`flex min-h-24 gap-3 rounded-lg border p-4 text-left transition ${active ? 'border-cyan-400 bg-cyan-400/10 shadow-lg shadow-cyan-950/20' : 'border-slate-800 bg-slate-900/70 hover:border-slate-600 hover:bg-slate-900'}`}
                        >
                          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? 'text-cyan-200' : 'text-slate-500'}`} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-white">{type}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span>
                          </span>
                          {active ? <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-cyan-200" /> : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {generationMode === 'template' ? (
                <aside className="space-y-5 rounded-lg border border-slate-800 bg-slate-900/70 p-4 lg:self-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers3 className="h-4 w-4 text-cyan-300" />
                      <p className="text-sm font-semibold text-white">Template settings</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Selected template: {projectType}.</p>
                  </div>

                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Depth</span>
                    <div className="grid gap-2">
                      {DIFFICULTIES.map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setDifficulty(level)}
                          className={`h-10 rounded-md border text-sm font-medium transition ${difficulty === level ? 'border-purple-400 bg-purple-400/10 text-purple-100' : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600'}`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </label>

                  <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-cyan-100">
                      <CheckCircle2 className="h-4 w-4" />
                      Output
                    </p>
                    <p className="mt-2 text-sm leading-6 text-cyan-100/80">Using the {projectType} template. The answer comes from the template set.</p>
                  </div>
                </aside>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
              <p className="text-sm text-slate-400">
                {user ? 'Generated projects are saved to your account history.' : `${guestRemaining} of 3 guest generations remaining.`}
              </p>
              <Button className="h-11 px-6" icon={Wand2} loading={loading} disabled={loading}>
                {loading ? 'Generating...' : generationMode === 'template' ? 'Generate Template' : 'Analyze and Generate'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
