import { GitBranch, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { apiErrorMessage, projectAnalyzerApi, unwrap } from '../services/api'

const toggles = [
  ['generate_docker', 'Generate Docker files'],
  ['generate_kubernetes', 'Generate Kubernetes files'],
  ['generate_helm', 'Generate Helm chart'],
  ['generate_github_actions', 'Generate GitHub Actions workflow'],
  ['generate_argocd', 'Generate Argo CD files'],
  ['generate_terraform', 'Generate Terraform files'],
  ['generate_readme', 'Generate README'],
  ['run_security_check', 'Run security check'],
  ['create_deployment_plan', 'Create deployment plan'],
]

export default function UploadProject() {
  const navigate = useNavigate()
  const [uploadType, setUploadType] = useState('zip')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    setLoading(true)
    const form = new FormData(event.currentTarget)
    try {
      let data
      if (uploadType === 'github') {
        data = unwrap(await projectAnalyzerApi.importGithubProject({
          project_name: form.get('project_name'),
          description: form.get('description') || null,
          github_repo_url: form.get('github_repo_url'),
          branch_name: form.get('branch_name')?.trim() || null,
          environment: form.get('environment'),
          deployment_type: form.get('deployment_type'),
          monitoring_enabled: form.get('monitoring_enabled') === 'on',
          security_scan_enabled: form.get('security_scan_enabled') === 'on',
          gitops_enabled: form.get('gitops_enabled') === 'on',
          auto_healing_enabled: form.get('auto_healing_enabled') === 'on',
        }))
      } else {
        const payload = new FormData()
        ;['project_name', 'description', 'branch_name', 'environment', 'deployment_type'].forEach((key) => payload.append(key, form.get(key) || ''))
        payload.append('upload_type', 'zip')
        payload.append('monitoring_enabled', form.get('monitoring_enabled') === 'on')
        payload.append('security_scan_enabled', form.get('security_scan_enabled') === 'on')
        payload.append('gitops_enabled', form.get('gitops_enabled') === 'on')
        payload.append('auto_healing_enabled', form.get('auto_healing_enabled') === 'on')
        payload.append('file', form.get('zip_file'))
        data = unwrap(await projectAnalyzerApi.uploadProject(payload))
      }
      const projectId = data.project?.id
      localStorage.setItem('opsforge_last_project_id', projectId)
      navigate(`/app/projects/${projectId}/analysis`)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Project upload failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-cyan-300">AI Project Analyzer</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Upload Project</h1>
      </div>
      <Card>
        <CardHeader title="Source and generation options" description="Upload a ZIP or analyze a GitHub repository without executing project code." />
        <CardContent>
          <form className="grid gap-5 lg:grid-cols-2" onSubmit={submit}>
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Project name</span>
              <input name="project_name" required className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="payments-api" />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Upload type</span>
              <select name="upload_type" value={uploadType} onChange={(event) => setUploadType(event.target.value)} className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400">
                <option value="zip">ZIP</option>
                <option value="github">GitHub repo</option>
              </select>
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm text-slate-300">Description</span>
              <input name="description" className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="Existing application to onboard into OpsForge" />
            </label>
            {uploadType === 'zip' ? (
              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm text-slate-300">ZIP file</span>
                <input name="zip_file" required type="file" accept=".zip" className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 file:mr-4 file:rounded-md file:border-0 file:bg-cyan-400 file:px-3 file:py-2 file:text-slate-950" />
              </label>
            ) : (
              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm text-slate-300">GitHub repository URL</span>
                <input name="github_repo_url" required className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" placeholder="https://github.com/org/repo" />
              </label>
            )}
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Branch name</span>
              <input name="branch_name" placeholder="Leave blank to use the repo default branch" className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400" />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Environment</span>
              <select name="environment" className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400">
                <option value="dev">dev</option><option value="staging">staging</option><option value="prod">prod</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Deployment target</span>
              <select name="deployment_type" defaultValue="gitops" className="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-400">
                <option value="docker">Docker</option><option value="kubernetes">Kubernetes</option><option value="helm">Helm</option><option value="gitops">GitOps</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
              {['monitoring_enabled', 'security_scan_enabled', 'gitops_enabled', 'auto_healing_enabled'].map((name, index) => (
                <label key={name} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
                  <input name={name} type="checkbox" defaultChecked={index < 3} className="h-4 w-4 accent-cyan-400" />
                  {['Enable monitoring', 'Enable security scan', 'Enable GitOps', 'Enable auto-healing config'][index]}
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:col-span-2">
              {toggles.map(([name, label]) => (
                <label key={name} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                  <input name={name} type="checkbox" defaultChecked className="h-4 w-4 accent-cyan-400" />
                  {label}
                </label>
              ))}
            </div>
            {message ? <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100 lg:col-span-2">{message}</div> : null}
            <div className="flex justify-end lg:col-span-2">
              <Button type="submit" icon={uploadType === 'zip' ? UploadCloud : GitBranch} loading={loading} disabled={loading}>{loading ? 'Analyzing...' : 'Analyze Project'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
