import { FileCode2, GitBranch, RefreshCw, Rocket } from 'lucide-react'
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
      await projectAnalyzerApi.generateFromAnalysis(projectId)
      localStorage.setItem('opsforge_last_project_id', projectId)
      navigate('/app/generated-files')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not generate DevOps files'))
    } finally {
      setGenerating(false)
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
