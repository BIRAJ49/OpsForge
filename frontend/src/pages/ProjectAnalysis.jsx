import { FileCode2, GitBranch, RefreshCw, Rocket, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { api, apiErrorMessage, projectAnalyzerApi, unwrap } from '../services/api'

const progressSteps = ['Uploading project', 'Extracting files', 'Scanning project structure', 'Detecting stack', 'Masking secrets', 'Generating recommendations', 'Generating DevOps files', 'Completed']

function CodeBlock({ value }) {
  return <pre className="max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 text-xs leading-5 text-slate-300">{JSON.stringify(value || {}, null, 2)}</pre>
}

export default function ProjectAnalysis() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [analysis, setAnalysis] = useState(null)
  const [files, setFiles] = useState([])
  const [projects, setProjects] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(Boolean(projectId))
  const [generating, setGenerating] = useState(false)
  const [profile, setProfile] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    async function load() {
      setMessage('')
      if (!projectId) {
        try {
          setProjects(unwrap(await api.get('/projects')))
        } catch (error) {
          setMessage(apiErrorMessage(error, 'Could not load projects'))
        }
        return
      }
      setLoading(true)
      try {
        const data = unwrap(await projectAnalyzerApi.getProjectAnalysis(projectId))
        setAnalysis(data)
        setProfile(data.analysis_json?.project_profile || null)
        setFiles(unwrap(await projectAnalyzerApi.getAnalysisFiles(projectId)))
      } catch (error) {
        setMessage(apiErrorMessage(error, 'Project analysis not found'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  async function generate() {
    setGenerating(true)
    setMessage('')
    try {
      await projectAnalyzerApi.generateFromAnalysis(projectId, { project_profile: profile })
      localStorage.setItem('opsforge_last_project_id', projectId)
      navigate('/app/generated-files')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not generate DevOps files'))
    } finally {
      setGenerating(false)
    }
  }

  function updateProfile(path, value) {
    setProfile((current) => {
      const next = JSON.parse(JSON.stringify(current || {}))
      let target = next
      for (const key of path.slice(0, -1)) {
        target[key] = target[key] || {}
        target = target[key]
      }
      target[path[path.length - 1]] = value
      return next
    })
  }

  async function saveProfile() {
    setSavingProfile(true)
    setMessage('')
    try {
      const updated = unwrap(await projectAnalyzerApi.updateProjectProfile(projectId, profile))
      setAnalysis(updated)
      setProfile(updated.analysis_json?.project_profile || profile)
      setMessage('Project profile saved. DevOps files will use these values.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not save project profile'))
    } finally {
      setSavingProfile(false)
    }
  }

  if (!projectId) {
    return (
      <Card>
        <CardHeader title="Project Analysis" description="Select an analyzed project or upload a new source package." action={<Link to="/app/upload-project"><Button icon={FileCode2}>Upload Project</Button></Link>} />
        <CardContent>
          {message ? <div className="mb-4 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{message}</div> : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} to={`/app/projects/${project.id}/analysis`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 transition hover:border-cyan-400/40">
                <p className="font-medium text-slate-100">{project.name}</p>
                <p className="mt-2 text-sm text-slate-400">{project.stack}</p>
                <Badge className="mt-3" tone="cyan">{project.environment}</Badge>
              </Link>
            ))}
          </div>
          {!projects.length && !message ? <div className="py-10 text-center text-sm text-slate-400">No projects found. Upload a ZIP or import a GitHub repository to start analysis.</div> : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-cyan-300">AI Project Analyzer</p>
          <h1 className="mt-1 text-2xl font-bold text-white">Project Analysis Result</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={RefreshCw} onClick={() => window.location.reload()}>Refresh</Button>
          <Button icon={Rocket} onClick={generate} loading={generating} disabled={!analysis || generating}>{generating ? 'Generating...' : 'Generate DevOps Files'}</Button>
        </div>
      </div>
      {message ? <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">{message}</div> : null}
      {loading ? <Card><CardContent><div className="grid gap-3 md:grid-cols-2">{progressSteps.map((step, index) => <div key={step} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300"><span className={index < 6 ? 'text-cyan-300' : 'text-slate-500'}>{step}</span></div>)}</div></CardContent></Card> : null}
      {analysis ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Project type', analysis.detected_project_type],
              ['Package manager', analysis.package_manager || 'Unknown'],
              ['Risk score', analysis.risk_score],
              ['Strategy', analysis.recommended_deployment_strategy],
            ].map(([label, value]) => (
              <Card key={label}><CardContent><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p></CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader title="Detected stack" description="Static rule-based analysis. Uploaded code is read as metadata and never executed." />
            <CardContent>
              <div className="flex flex-wrap gap-2">{analysis.detected_stack.map((item) => <Badge key={item} tone="cyan">{item}</Badge>)}</div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Info label="Frontend path" value={analysis.frontend_path || 'Not detected'} />
                <Info label="Backend path" value={analysis.backend_path || 'Not detected'} />
                <Info label="Build command" value={Object.values(analysis.build_commands || {}).join(' | ') || 'Not detected'} />
                <Info label="Start command" value={Object.values(analysis.start_commands || {}).join(' | ') || 'Not detected'} />
                <Info label="Detected ports" value={JSON.stringify(analysis.detected_ports || {})} />
                <Info label="Databases" value={(analysis.detected_databases || []).join(', ') || 'None'} />
                <Info label="Cache" value={(analysis.detected_cache || []).join(', ') || 'None'} />
                <Info label="Environment variables" value={Object.keys(analysis.detected_env_vars || {}).join(', ') || 'None'} />
              </div>
            </CardContent>
          </Card>
          {profile ? (
            <Card>
              <CardHeader
                title="Project profile"
                description="Review and correct detected commands, paths, ports, and runtime details before generating DevOps files."
                action={<Button variant="secondary" icon={Save} loading={savingProfile} onClick={saveProfile}>Save Profile</Button>}
              />
              <CardContent>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge tone={profile.confidence === 'high' ? 'green' : profile.confidence === 'medium' ? 'amber' : 'rose'}>{profile.confidence || 'unknown'} confidence</Badge>
                  <Badge tone="cyan">{profile.project_type || 'unknown'}</Badge>
                  <Badge tone={profile.ai_assisted ? 'cyan' : 'slate'}>{profile.ai_assisted ? `AI-assisted${profile.ai_model ? `: ${profile.ai_model}` : ''}` : 'Rule-based profile'}</Badge>
                </div>
                <div className="grid gap-5 xl:grid-cols-2">
                  <ProfileSection title="Frontend">
                    <ProfileCheck label="Enabled" checked={Boolean(profile.frontend?.enabled)} onChange={(value) => updateProfile(['frontend', 'enabled'], value)} />
                    <ProfileInput label="Framework" value={profile.frontend?.framework || ''} onChange={(value) => updateProfile(['frontend', 'framework'], value)} />
                    <ProfileInput label="Root path" value={profile.frontend?.root || ''} onChange={(value) => updateProfile(['frontend', 'root'], value)} />
                    <ProfileInput label="Install command" value={profile.frontend?.install_command || ''} onChange={(value) => updateProfile(['frontend', 'install_command'], value)} />
                    <ProfileInput label="Build command" value={profile.frontend?.build_command || ''} onChange={(value) => updateProfile(['frontend', 'build_command'], value)} />
                    <ProfileInput label="Output directory" value={profile.frontend?.output_dir || ''} onChange={(value) => updateProfile(['frontend', 'output_dir'], value)} />
                    <ProfileInput label="Port" type="number" value={profile.frontend?.port || ''} onChange={(value) => updateProfile(['frontend', 'port'], Number(value) || '')} />
                  </ProfileSection>
                  <ProfileSection title="Backend">
                    <ProfileCheck label="Enabled" checked={Boolean(profile.backend?.enabled)} onChange={(value) => updateProfile(['backend', 'enabled'], value)} />
                    <ProfileInput label="Framework" value={profile.backend?.framework || ''} onChange={(value) => updateProfile(['backend', 'framework'], value)} />
                    <ProfileInput label="Root path" value={profile.backend?.root || ''} onChange={(value) => updateProfile(['backend', 'root'], value)} />
                    <ProfileInput label="Install command" value={profile.backend?.install_command || ''} onChange={(value) => updateProfile(['backend', 'install_command'], value)} />
                    <ProfileInput label="Start command" value={profile.backend?.start_command || ''} onChange={(value) => updateProfile(['backend', 'start_command'], value)} />
                    <ProfileInput label="Health path" value={profile.backend?.health_path || ''} onChange={(value) => updateProfile(['backend', 'health_path'], value)} />
                    <ProfileInput label="Port" type="number" value={profile.backend?.port || ''} onChange={(value) => updateProfile(['backend', 'port'], Number(value) || '')} />
                  </ProfileSection>
                </div>
                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  <ProfileList label="Databases" values={profile.databases} onChange={(value) => updateProfile(['databases'], splitList(value))} />
                  <ProfileList label="Cache" values={profile.cache} onChange={(value) => updateProfile(['cache'], splitList(value))} />
                  <ProfileList label="Environment variables" values={profile.environment_variables} onChange={(value) => updateProfile(['environment_variables'], splitList(value))} />
                </div>
                {profile.notes?.length ? <div className="mt-5 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{profile.notes.join(' ')}</div> : null}
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card><CardHeader title="Existing DevOps files" /><CardContent><List values={analysis.existing_devops_files} empty="No existing DevOps files detected" /></CardContent></Card>
            <Card><CardHeader title="Missing DevOps files" /><CardContent><List values={analysis.missing_devops_files} empty="No missing files detected" /></CardContent></Card>
            <Card><CardHeader title="Security warnings" /><CardContent><List values={analysis.security_warnings} empty="No warnings detected" tone="amber" /></CardContent></Card>
            <Card><CardHeader title="Recommended next steps" /><CardContent><List values={analysis.analysis_json?.recommended_next_steps} empty="No recommendations available" tone="green" /></CardContent></Card>
          </div>
          <Card><CardHeader title="Detected environment variables" /><CardContent><CodeBlock value={analysis.detected_env_vars} /></CardContent></Card>
          <Card><CardHeader title="Important files" /><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-400"><tr><th className="p-3">Path</th><th className="p-3">Type</th><th className="p-3">Language</th><th className="p-3">Summary</th></tr></thead><tbody>{files.map((file) => <tr key={file.id} className="border-t border-slate-800"><td className="p-3 text-slate-100">{file.file_path}</td><td className="p-3 text-slate-300">{file.file_type}</td><td className="p-3 text-slate-300">{file.language}</td><td className="p-3 text-slate-400">{file.summary}</td></tr>)}</tbody></table></div></CardContent></Card>
          <div className="flex justify-end gap-2"><Link to="/app/generated-files"><Button variant="secondary" icon={GitBranch}>Generated Files</Button></Link><Button icon={Rocket} onClick={generate} loading={generating} disabled={generating}>Generate DevOps Files</Button></div>
        </>
      ) : null}
    </div>
  )
}

function Info({ label, value }) {
  return <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-2 break-words text-sm text-slate-100">{value}</p></div>
}

function List({ values = [], empty, tone = 'cyan' }) {
  return values?.length ? <div className="flex flex-wrap gap-2">{values.map((item) => <Badge key={item} tone={tone}>{item}</Badge>)}</div> : <p className="text-sm text-slate-400">{empty}</p>
}

function ProfileSection({ title, children }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"><h3 className="mb-4 font-semibold text-white">{title}</h3><div className="grid gap-3">{children}</div></div>
}

function ProfileInput({ label, value, onChange, type = 'text' }) {
  return (
    <label className="grid gap-1 text-sm text-slate-300">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" />
    </label>
  )
}

function ProfileCheck({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-cyan-400" />
      {label}
    </label>
  )
}

function ProfileList({ label, values = [], onChange }) {
  return <ProfileInput label={label} value={(values || []).join(', ')} onChange={onChange} />
}

function splitList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}
