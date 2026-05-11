import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { api, unwrap } from '../services/api'

const toggles = [
  'Enable monitoring',
  'Enable security scan',
  'Enable AI incident assistant',
  'Enable auto-healing',
]

export default function CreateProject() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(event.currentTarget)
    try {
      const project = unwrap(await api.post('/projects', {
        name: form.get('name'),
        description: form.get('description') || null,
        app_type: form.get('app_type'),
        stack: form.get('stack'),
        deployment_type: form.get('deployment_type'),
        environment: form.get('environment'),
        monitoring_enabled: form.get('monitoring_enabled') === 'on',
        security_scan_enabled: form.get('security_scan_enabled') === 'on',
        ai_assistant_enabled: form.get('ai_assistant_enabled') === 'on',
        auto_healing_enabled: form.get('auto_healing_enabled') === 'on',
      }))
      await api.post(`/projects/${project.id}/generate`)
      localStorage.setItem('opsforge_last_project_id', project.id)
      navigate('/app/generated-files')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader title="Create Project" description="Generate runtime, Kubernetes, GitOps, CI/CD, and security defaults." />
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm text-slate-300">Project name</span>
            <input name="name" required className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="payments-api" />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm text-slate-300">Description</span>
            <input name="description" className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="Payment workflow service" />
          </label>
          {[
            ['App type', 'app_type', [['Frontend', 'frontend'], ['Backend', 'backend'], ['Full-stack', 'fullstack']]],
            ['Stack', 'stack', [['React + FastAPI + PostgreSQL + Redis', 'React + FastAPI + PostgreSQL + Redis'], ['React', 'React'], ['FastAPI', 'FastAPI'], ['Node.js', 'Node.js']]],
            ['Deployment type', 'deployment_type', [['Docker', 'docker'], ['Kubernetes', 'kubernetes'], ['Helm', 'helm'], ['GitOps', 'gitops']]],
            ['Environment', 'environment', [['Dev', 'dev'], ['Staging', 'staging'], ['Prod', 'prod']]],
          ].map(([label, name, options]) => (
            <label key={label} className="space-y-2">
              <span className="text-sm text-slate-300">{label}</span>
              <select name={name} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400">
                {options.map(([option, value]) => <option key={value} value={value}>{option}</option>)}
              </select>
            </label>
          ))}
          <div className="grid gap-3 md:col-span-2 sm:grid-cols-2">
            {toggles.map((toggle, index) => (
              <label key={toggle} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <input name={['monitoring_enabled', 'security_scan_enabled', 'ai_assistant_enabled', 'auto_healing_enabled'][index]} type="checkbox" defaultChecked={index < 3} className="h-4 w-4 accent-cyan-400" />
                <span className="text-sm text-slate-200">{toggle}</span>
              </label>
            ))}
          </div>
          {error ? <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100 md:col-span-2">{error}</div> : null}
          <div className="flex justify-end gap-3 md:col-span-2">
            <Button variant="secondary" type="button">Save Draft</Button>
            <Button type="submit" icon={CheckCircle2} loading={loading} disabled={loading}>{loading ? 'Creating...' : 'Generate Project'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
