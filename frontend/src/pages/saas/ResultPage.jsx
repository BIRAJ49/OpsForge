import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Copy, Download, FileText, GitBranch } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { downloadProject, getProjects } from '../../utils/generator'
import { api, apiErrorMessage, unwrap } from '../../services/api'

const tabs = ['Overview', 'Architecture', 'Tools', 'Steps', 'Code Files', 'README', 'Downloads']

function ConnectGitHubMessage({ text }) {
  return (
    <>
      {text}{' '}
      <Link to="/app/connect-github" className="font-semibold text-cyan-200 underline decoration-cyan-300/50 underline-offset-4 hover:text-white">
        Connect GitHub
      </Link>
    </>
  )
}

export default function ResultPage() {
  const { id } = useParams()
  const initialProject = useMemo(() => getProjects().find((project) => project.id === id), [id])
  const [project, setProject] = useState(initialProject)
  const [loading, setLoading] = useState(!initialProject)
  const [tab, setTab] = useState('Overview')
  const [copiedFile, setCopiedFile] = useState('')
  const [message, setMessage] = useState('')
  const [downloadFormat, setDownloadFormat] = useState('')

  useEffect(() => {
    async function loadBackendResult() {
      const backendId = id?.startsWith('backend-') ? id.replace('backend-', '') : initialProject?.backendProjectId
      if (!backendId) {
        setLoading(false)
        return
      }
      try {
        const result = unwrap(await api.get(`/projects/${backendId}/result`))
        setProject({
          id: `backend-${backendId}`,
          backendProjectId: Number(backendId),
          title: result.title,
          projectType: result.projectType,
          difficulty: result.difficulty,
          requirement: result.requirement,
          overview: result.overview,
          architecture: result.architecture,
          tools: result.tools,
          steps: result.steps,
          folderStructure: result.folderStructure,
          files: result.files,
          downloads: initialProject?.downloads || { zip: 0, pdf: 0 },
          createdAt: result.project?.created_at,
        })
      } finally {
        setLoading(false)
      }
    }
    loadBackendResult()
  }, [id, initialProject])

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-400">Loading generated project...</div>
  }

  if (!project) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent>
          <h1 className="text-xl font-semibold text-white">Project not found</h1>
          <p className="mt-2 text-sm text-slate-400">Generate a new project or open one from your project history.</p>
          <Link to="/generate"><Button className="mt-5">Generate Project</Button></Link>
        </CardContent>
      </Card>
    )
  }

  async function download(format) {
    setDownloadFormat(format)
    try {
      setProject(await downloadProject(project, format))
    } finally {
      setDownloadFormat('')
    }
  }

  async function copyCode(fileName, content) {
    await navigator.clipboard.writeText(content || '')
    setCopiedFile(fileName)
    window.setTimeout(() => setCopiedFile(''), 1800)
  }

  async function pushToGitHub() {
    const backendId = project.backendProjectId || (project.id?.startsWith('backend-') ? Number(project.id.replace('backend-', '')) : null)
    if (!backendId) {
      setMessage('Save this generated project before pushing files to GitHub.')
      return
    }
    setMessage('')
    try {
      const repoResult = unwrap(await api.post(`/projects/${backendId}/github/create-repo`))
      if (repoResult.status !== 'configured') {
        setMessage(
          repoResult.status === 'requires_connection'
            ? <ConnectGitHubMessage text={repoResult.message || 'GitHub is not connected for this account.'} />
            : repoResult.message || 'GitHub repository was not created',
        )
        return
      }
      const pushResult = unwrap(await api.post(`/projects/${backendId}/github/push-generated-files`))
      if (pushResult.status !== 'configured' || pushResult.files_pushed === 0) {
        setMessage(
          pushResult.status === 'requires_connection'
            ? <ConnectGitHubMessage text={pushResult.message || 'GitHub is not connected for this account.'} />
            : pushResult.message || 'Generated files were not pushed to GitHub',
        )
        return
      }
      setMessage(`Generated files pushed to GitHub: ${pushResult.files_pushed}/${pushResult.files_total}`)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'GitHub integration token is required before pushing files'))
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone="cyan">{project.projectType}</Badge>
              <Badge tone="purple">{project.difficulty}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-white">{project.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{project.requirement}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={GitBranch} onClick={pushToGitHub}>Push to GitHub</Button>
            <Button icon={Download} loading={downloadFormat === 'zip'} onClick={() => download('zip')}>ZIP</Button>
            <Button variant="secondary" icon={FileText} loading={downloadFormat === 'pdf'} onClick={() => download('pdf')}>PDF</Button>
          </div>
        </CardContent>
      </Card>

      {message ? <div className="rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}

      <div className="flex gap-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition ${tab === item ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
          >
            {item}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={tab} description="Generated DevOps project content." />
        <CardContent>
          {tab === 'Overview' ? <p className="leading-7 text-slate-300">{project.overview}</p> : null}
          {tab === 'Architecture' ? <p className="leading-7 text-slate-300">{project.architecture}</p> : null}
          {tab === 'Tools' ? (
            <div className="flex flex-wrap gap-2">{project.tools.map((tool) => <Badge key={tool} tone="blue">{tool}</Badge>)}</div>
          ) : null}
          {tab === 'Steps' ? (
            <ol className="space-y-3 text-slate-300">
              {project.steps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
            </ol>
          ) : null}
          {tab === 'Code Files' ? (
            <div className="space-y-4">
              {Object.entries(project.files).map(([fileName, content]) => (
                <div key={fileName} className="overflow-hidden rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2">
                    <p className="min-w-0 truncate text-sm font-medium text-cyan-200">{fileName}</p>
                    <div className="relative inline-flex shrink-0">
                      {copiedFile === fileName ? (
                        <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-950/30">
                          Code copied
                        </div>
                      ) : null}
                      <Button size="sm" variant="ghost" icon={Copy} onClick={() => copyCode(fileName, content)}>Copy code</Button>
                    </div>
                  </div>
                  <pre className="custom-scrollbar overflow-x-auto bg-slate-950/70 p-4 text-xs leading-6 text-slate-300"><code>{content}</code></pre>
                </div>
              ))}
            </div>
          ) : null}
          {tab === 'README' ? (
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <div className="flex justify-end border-b border-slate-800 bg-slate-950 px-4 py-2">
                <div className="relative inline-flex">
                  {copiedFile === 'README.md' ? (
                    <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-950/30">
                      Code copied
                    </div>
                  ) : null}
                  <Button size="sm" variant="ghost" icon={Copy} onClick={() => copyCode('README.md', project.files['README.md'])}>Copy code</Button>
                </div>
              </div>
              <pre className="custom-scrollbar overflow-x-auto bg-slate-950 p-4 text-sm leading-6 text-slate-300">
                <code>{project.files['README.md']}</code>
              </pre>
            </div>
          ) : null}
          {tab === 'Downloads' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <button type="button" onClick={() => download('zip')} disabled={Boolean(downloadFormat)} className="rounded-lg border border-slate-700 bg-slate-950 p-5 text-left transition hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60">
                <p className="flex items-center gap-2 font-semibold text-white">
                  {downloadFormat === 'zip' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" /> : null}
                  Download ZIP
                </p>
                <p className="mt-2 text-sm text-slate-400">{project.downloads?.zip || 0} downloads</p>
              </button>
              <button type="button" onClick={() => download('pdf')} disabled={Boolean(downloadFormat)} className="rounded-lg border border-slate-700 bg-slate-950 p-5 text-left transition hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60">
                <p className="flex items-center gap-2 font-semibold text-white">
                  {downloadFormat === 'pdf' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" /> : null}
                  Download PDF
                </p>
                <p className="mt-2 text-sm text-slate-400">{project.downloads?.pdf || 0} downloads</p>
              </button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
