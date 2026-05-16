import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Download,
  FileCode2,
  FileText,
  FolderTree,
  GitBranch,
  Layers3,
  ListChecks,
  Package,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { downloadProject, getProjects } from '../../utils/generator'
import { api, apiErrorMessage, unwrap } from '../../services/api'

const sections = [
  { id: 'Overview', icon: Layers3 },
  { id: 'Features', icon: CheckCircle2 },
  { id: 'Architecture', icon: FolderTree },
  { id: 'Tools', icon: ShieldCheck },
  { id: 'Steps', icon: ListChecks },
  { id: 'Code Files', icon: FileCode2 },
  { id: 'README', icon: FileText },
  { id: 'Downloads', icon: Package },
]

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
  const [section, setSection] = useState('Overview')
  const [copiedFile, setCopiedFile] = useState('')
  const [message, setMessage] = useState('')
  const [downloadFormat, setDownloadFormat] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [fileFilter, setFileFilter] = useState('')

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
          features: result.features,
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

  const fileEntries = useMemo(() => Object.entries(project?.files || {}), [project])
  const filteredFiles = useMemo(() => {
    const query = fileFilter.trim().toLowerCase()
    if (!query) return fileEntries
    return fileEntries.filter(([fileName]) => fileName.toLowerCase().includes(query))
  }, [fileEntries, fileFilter])
  const selectedFile = useMemo(() => {
    if (!fileEntries.length) return null
    const preferred = selectedFileName || fileEntries[0][0]
    return fileEntries.find(([fileName]) => fileName === preferred) || fileEntries[0]
  }, [fileEntries, selectedFileName])

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

  async function copyAllFiles() {
    const payload = fileEntries.map(([fileName, content]) => `# ${fileName}\n${content || ''}`).join('\n\n')
    await copyCode('all-files', payload)
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

  const selectedFileNameText = selectedFile?.[0] || ''
  const selectedFileContent = selectedFile?.[1] || ''
  const createdDate = project.createdAt
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(project.createdAt))
    : 'Recently generated'
  const toolCount = project.tools?.length || 0
  const stepCount = project.steps?.length || 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-lg border border-slate-700/70 bg-slate-900/85 shadow-xl shadow-slate-950/20 backdrop-blur">
        <div className="border-b border-slate-800 bg-slate-950/35 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="cyan">{project.projectType}</Badge>
            <Badge tone="purple">{project.difficulty}</Badge>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ready
            </span>
          </div>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">{project.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{project.requirement}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Generated</p>
                <p className="mt-1 text-sm font-medium text-slate-100">{createdDate}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Project Files</p>
                <p className="mt-1 text-sm font-medium text-slate-100">{fileEntries.length} files</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Plan</p>
                <p className="mt-1 text-sm font-medium text-slate-100">{stepCount} steps</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
            <p className="text-sm font-semibold text-white">Export and publish</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">Ship this generated set as a repository or downloadable package.</p>
            <div className="mt-4 grid gap-2">
              <Button icon={GitBranch} onClick={pushToGitHub} className="w-full">Push to GitHub</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={Download} loading={downloadFormat === 'zip'} onClick={() => download('zip')}>ZIP</Button>
                <Button variant="secondary" icon={FileText} loading={downloadFormat === 'pdf'} onClick={() => download('pdf')}>PDF</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/80">
            <div className="border-b border-slate-800 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workspace</p>
            </div>
            <nav className="grid gap-1 p-2">
              {sections.map(({ id: item, icon: Icon }) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSection(item)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition ${section === item ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <Card className="min-w-0">
          <CardHeader
            title={section}
            description={section === 'Code Files' ? `${fileEntries.length} generated files ready to inspect or copy.` : 'Generated DevOps project content.'}
            action={section === 'Code Files' && fileEntries.length ? (
              <div className="relative">
                {copiedFile === 'all-files' ? (
                  <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-950/30">
                    All files copied
                  </div>
                ) : null}
                <Button size="sm" variant="secondary" icon={ClipboardCopy} onClick={copyAllFiles}>Copy all</Button>
              </div>
            ) : null}
          />
          <CardContent>
            {section === 'Overview' ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                <p className="leading-7 text-slate-300">{project.overview}</p>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Tools</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{toolCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Files</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{fileEntries.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Downloads</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{(project.downloads?.zip || 0) + (project.downloads?.pdf || 0)}</p>
                  </div>
                </div>
              </div>
            ) : null}
            {section === 'Features' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(project.features || []).map((feature) => (
                  <div key={feature} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <p className="text-sm leading-6 text-slate-300">{feature}</p>
                  </div>
                ))}
                {!(project.features || []).length ? (
                  <p className="text-sm text-slate-400">No feature summary was generated for this project.</p>
                ) : null}
              </div>
            ) : null}
            {section === 'Architecture' ? <p className="leading-7 text-slate-300">{project.architecture}</p> : null}
            {section === 'Tools' ? (
              <div className="flex flex-wrap gap-2">{(project.tools || []).map((tool) => <Badge key={tool} tone="blue">{tool}</Badge>)}</div>
            ) : null}
            {section === 'Steps' ? (
              <ol className="grid gap-3 text-slate-300">
                {(project.steps || []).map((step, index) => (
                  <li key={step} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-400 text-sm font-semibold text-slate-950">{index + 1}</span>
                    <span className="pt-0.5 leading-6">{step}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {section === 'Code Files' ? (
              <div className="grid min-h-[560px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="border-b border-slate-800 bg-slate-950/80 xl:border-b-0 xl:border-r">
                  <div className="border-b border-slate-800 p-3">
                    <label className="flex h-10 items-center gap-2 rounded-md border border-slate-800 bg-slate-900/70 px-3 text-sm text-slate-400">
                      <Search className="h-4 w-4 shrink-0" />
                      <input
                        value={fileFilter}
                        onChange={(event) => setFileFilter(event.target.value)}
                        placeholder="Search files"
                        className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
                      />
                    </label>
                  </div>
                  <div className="custom-scrollbar max-h-72 overflow-y-auto p-2 xl:max-h-[500px]">
                    {filteredFiles.map(([fileName, content]) => (
                      <button
                        key={fileName}
                        type="button"
                        onClick={() => setSelectedFileName(fileName)}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition ${selectedFileNameText === fileName ? 'bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-400/30' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
                      >
                        <FileCode2 className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{fileName}</span>
                        <span className="text-xs text-slate-500">{String(content || '').split('\n').length}</span>
                      </button>
                    ))}
                    {!filteredFiles.length ? <p className="px-3 py-4 text-sm text-slate-500">No files match that search.</p> : null}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-cyan-100">{selectedFileNameText || 'No file selected'}</p>
                      <p className="mt-1 text-xs text-slate-500">{selectedFileContent.split('\n').length} lines</p>
                    </div>
                    <div className="relative inline-flex shrink-0">
                      {copiedFile === selectedFileNameText ? (
                        <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-950/30">
                          Code copied
                        </div>
                      ) : null}
                      <Button size="sm" variant="ghost" icon={Copy} onClick={() => copyCode(selectedFileNameText, selectedFileContent)}>Copy code</Button>
                    </div>
                  </div>
                  <pre className="custom-scrollbar max-h-[520px] overflow-auto bg-[#020817] p-4 text-xs leading-6 text-slate-300"><code>{selectedFileContent}</code></pre>
                </div>
              </div>
            ) : null}
            {section === 'README' ? (
              <div className="overflow-hidden rounded-lg border border-slate-800">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2">
                  <p className="min-w-0 truncate text-sm font-medium text-cyan-200">README.md</p>
                  <div className="relative inline-flex shrink-0">
                    {copiedFile === 'README.md' ? (
                      <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-950/30">
                        Code copied
                      </div>
                    ) : null}
                    <Button size="sm" variant="ghost" icon={Copy} onClick={() => copyCode('README.md', project.files?.['README.md'])}>Copy code</Button>
                  </div>
                </div>
                <pre className="custom-scrollbar overflow-x-auto bg-slate-950 p-4 text-sm leading-6 text-slate-300">
                  <code>{project.files?.['README.md'] || 'README.md was not generated for this project.'}</code>
                </pre>
              </div>
            ) : null}
            {section === 'Downloads' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <button type="button" onClick={() => download('zip')} disabled={Boolean(downloadFormat)} className="rounded-lg border border-slate-700 bg-slate-950 p-5 text-left transition hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60">
                  <p className="flex items-center gap-2 font-semibold text-white">
                    {downloadFormat === 'zip' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" /> : <Download className="h-4 w-4 text-cyan-200" />}
                    Download ZIP
                  </p>
                  <p className="mt-2 text-sm text-slate-400">{project.downloads?.zip || 0} downloads</p>
                </button>
                <button type="button" onClick={() => download('pdf')} disabled={Boolean(downloadFormat)} className="rounded-lg border border-slate-700 bg-slate-950 p-5 text-left transition hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60">
                  <p className="flex items-center gap-2 font-semibold text-white">
                    {downloadFormat === 'pdf' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" /> : <FileText className="h-4 w-4 text-cyan-200" />}
                    Download PDF
                  </p>
                  <p className="mt-2 text-sm text-slate-400">{project.downloads?.pdf || 0} downloads</p>
                </button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
