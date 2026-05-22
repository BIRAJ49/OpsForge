import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, Download, Eye, FileCode2, GitBranch, Info, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { api, apiErrorMessage, projectAnalyzerApi, unwrap } from '../services/api'

function StatusMessage({ tone, message, onClose }) {
  const config = {
    success: {
      icon: CheckCircle2,
      className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
      iconClassName: 'text-emerald-300',
    },
    error: {
      icon: AlertTriangle,
      className: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
      iconClassName: 'text-rose-300',
    },
    info: {
      icon: Info,
      className: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100',
      iconClassName: 'text-cyan-300',
    },
  }[tone] || {
    icon: Info,
    className: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100',
    iconClassName: 'text-cyan-300',
  }
  const Icon = config.icon

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg shadow-slate-950/20 ${config.className}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.iconClassName}`} />
      <p className="min-w-0 flex-1 leading-5">{message}</p>
      <button type="button" onClick={onClose} className="rounded p-1 text-current opacity-70 transition hover:bg-white/10 hover:opacity-100" aria-label="Dismiss message">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

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

function fileTypeLabel(fileType = 'other') {
  return fileType.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function GeneratedFiles() {
  const [projects, setProjects] = useState([])
  const [files, setFiles] = useState([])
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')
  const [loading, setLoading] = useState(true)
  const [filesLoading, setFilesLoading] = useState(false)
  const [projectId, setProjectId] = useState(null)
  const [showFiles, setShowFiles] = useState(false)
  const [copiedFileId, setCopiedFileId] = useState(null)

  const showMessage = useCallback((text, tone = 'info') => {
    setMessage(text)
    setMessageTone(tone)
  }, [])

  const loadFileContents = useCallback(async (generatedFiles) => {
    const filesWithContent = await Promise.all(
      generatedFiles.map(async (file) => {
        if (!file.id || file.content != null) return file
        const data = unwrap(await api.get(`/generated-files/${file.id}`))
        return data
      }),
    )
    return filesWithContent
  }, [])

  const loadFilesForProject = useCallback(async (nextProjectId, options = {}) => {
    if (!nextProjectId) {
      setFiles([])
      setProjectId(null)
      return
    }

    const normalizedProjectId = String(nextProjectId)
    setFilesLoading(true)
    setProjectId(normalizedProjectId)
    setShowFiles(true)
    setFiles([])
    localStorage.setItem('opsforge_last_project_id', normalizedProjectId)
    if (!options.keepMessage) setMessage('')

    try {
      const generatedResponse = await api.get(`/projects/${normalizedProjectId}/generated-files`)
      const generatedFiles = unwrap(generatedResponse)
      setFiles(await loadFileContents(generatedFiles))
      if (!generatedFiles.length) {
        showMessage('No generated files for this project yet. Open the analysis page and choose files to generate.', 'info')
      }
    } catch (error) {
      showMessage(apiErrorMessage(error, 'Could not load generated files'), 'error')
    } finally {
      setFilesLoading(false)
    }
  }, [loadFileContents, showMessage])

  useEffect(() => {
    async function loadProjects() {
      setLoading(true)
      try {
        const data = unwrap(await api.get('/projects'))
        setProjects(data)

        if (!data.length) {
          setFiles([])
          setProjectId(null)
          setShowFiles(false)
          showMessage('Create a project first, then generate DevOps files.', 'info')
          return
        }

        setFiles([])
        setProjectId(null)
        setShowFiles(false)
        setMessage('')
      } catch (error) {
        showMessage(apiErrorMessage(error, 'Could not load projects'), 'error')
      } finally {
        setLoading(false)
      }
    }
    loadProjects()
  }, [loadFilesForProject, showMessage])

  async function copyFile(file) {
    try {
      const data = unwrap(await api.get(`/generated-files/${file.id}`))
      await navigator.clipboard.writeText(data.content || '')
      setCopiedFileId(file.id)
      window.setTimeout(() => setCopiedFileId(null), 1800)
    } catch {
      showMessage('Could not copy file content', 'error')
    }
  }

  async function regenerateFile(file) {
    if (!projectId) return
    try {
      await projectAnalyzerApi.regenerateFile(projectId, file.file_path)
      showMessage(`Regenerated ${file.file_name}`, 'success')
      await loadFilesForProject(projectId, { keepMessage: true })
    } catch (error) {
      showMessage(apiErrorMessage(error, 'Could not regenerate file'), 'error')
    }
  }

  async function pushToGitHub() {
    if (!projectId) return
    try {
      const repoResult = unwrap(await api.post(`/projects/${projectId}/github/create-repo`))
      if (repoResult.status !== 'configured') {
        showMessage(
          repoResult.status === 'requires_connection'
            ? <ConnectGitHubMessage text={repoResult.message || 'GitHub is not connected for this account.'} />
            : repoResult.message || 'GitHub repository was not created',
          repoResult.status === 'requires_connection' ? 'info' : 'error',
        )
        return
      }
      const pushResult = unwrap(await api.post(`/projects/${projectId}/github/push-generated-files`))
      if (pushResult.status !== 'configured' || pushResult.files_pushed === 0) {
        showMessage(
          pushResult.status === 'requires_connection'
            ? <ConnectGitHubMessage text={pushResult.message || 'GitHub is not connected for this account.'} />
            : pushResult.message || 'Generated files were not pushed to GitHub',
          pushResult.status === 'requires_connection' ? 'info' : 'error',
        )
        return
      }
      const appResult = unwrap(await api.post(`/projects/${projectId}/gitops/application?path=k8s`))
      if (!['created', 'updated'].includes(appResult.status)) {
        showMessage(`Generated files pushed, but Argo CD registration needs attention: ${appResult.message}`, 'info')
        return
      }
      showMessage(`Generated files pushed to GitHub and Argo CD app ${appResult.app_name} ${appResult.status}.`, 'success')
    } catch (error) {
      showMessage(apiErrorMessage(error, 'GitHub integration token is required before pushing files'), 'error')
    }
  }

  async function downloadFile(file) {
    try {
      const response = await api.get(`/generated-files/${file.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = file.file_name
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      showMessage('Could not download file', 'error')
    }
  }

  async function downloadAllFiles() {
    if (!projectId) return
    try {
      const response = await api.get(`/projects/${projectId}/download/zip`, { responseType: 'blob' })
      const disposition = response.headers?.['content-disposition'] || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || 'opsforge-generated-files.zip'
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      showMessage(apiErrorMessage(error, 'Could not download generated files ZIP'), 'error')
    }
  }

  const selectedProject = projects.find((project) => String(project.id) === String(projectId))
  const otherProjects = projects.filter((project) => String(project.id) !== String(projectId))
  const groupedGeneratedFiles = files.reduce((groups, file) => {
    const key = file.file_type || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(file)
    return groups
  }, {})

  return (
    <Card>
      <CardHeader
        title={showFiles ? selectedProject?.name || 'Generated Files' : 'Generated Files'}
        description={showFiles ? 'Review, preview, download, regenerate, or push files for this project.' : 'Choose a project to open its generated files.'}
      />
      <CardContent>
        {message ? <StatusMessage tone={messageTone} message={message} onClose={() => setMessage('')} /> : null}
        {loading ? <div className="py-8 text-center text-sm text-slate-400">Loading projects...</div> : null}
        {!loading && !showFiles ? (
          <div className="space-y-3">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => loadFilesForProject(project.id)}
                className="grid w-full min-w-0 gap-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-left transition hover:border-cyan-400/50 hover:bg-slate-900/70 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-100">{project.name}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{project.stack || project.description || 'No stack details recorded'}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge tone="cyan">{project.deployment_type || 'project'}</Badge>
                    <Badge tone="slate">{project.environment || 'env'}</Badge>
                    {project.github_repo_url ? <Badge tone="purple">GitHub</Badge> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-cyan-200 sm:justify-end">
                  <FileCode2 className="h-5 w-5 shrink-0 text-cyan-300" />
                  Open files
                </div>
              </button>
            ))}
            {!projects.length ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
                Create or upload a project first.
              </div>
            ) : null}
          </div>
        ) : null}
        {!loading && showFiles ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50">
              <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFiles(false)
                      setProjectId(null)
                      setFiles([])
                      setMessage('')
                    }}
                    className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-cyan-200 transition hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Projects
                  </button>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Selected project</p>
                  <h2 className="mt-1 truncate text-lg font-semibold text-slate-100">{selectedProject?.name || 'Project'}</h2>
                  <p className="mt-1 text-sm text-slate-400">{files.length} generated file{files.length === 1 ? '' : 's'} loaded for this project.</p>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Link to={`/app/projects/${projectId}/analysis`}>
                    <Button variant="secondary" icon={FileCode2}>Open Analysis</Button>
                  </Link>
                  <Button variant="secondary" icon={Download} onClick={downloadAllFiles} disabled={!files.length}>Download ZIP</Button>
                  <Button variant="secondary" icon={GitBranch} onClick={pushToGitHub}>Push to GitHub</Button>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-5">
              <div className="rounded-lg border border-slate-800 bg-slate-950/50">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Generated Output</p>
                    <p className="mt-1 text-xs text-slate-400">{files.length} file{files.length === 1 ? '' : 's'} available for this project</p>
                  </div>
                  <Badge tone={files.length ? 'green' : 'slate'}>{files.length ? 'Ready' : 'Empty'}</Badge>
                </div>

                {filesLoading ? <div className="py-8 text-center text-sm text-slate-400">Loading files for selected project...</div> : null}
                {!filesLoading && projectId && !files.length ? (
                  <div className="p-8 text-center">
                    <FileCode2 className="mx-auto h-10 w-10 text-cyan-300" />
                    <p className="mt-4 text-sm font-semibold text-slate-100">No generated files for this project</p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                      Open the analysis page, choose the files for this project, and generate them there.
                    </p>
                    <Link to={`/app/projects/${projectId}/analysis`}>
                      <Button className="mt-5" icon={FileCode2}>Open Analysis</Button>
                    </Link>
                  </div>
                ) : null}

                {!filesLoading && files.length ? (
                  <div className="space-y-5 p-4">
                    {Object.entries(groupedGeneratedFiles).map(([fileType, generatedFiles]) => (
                      <section key={fileType} className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-100">{fileTypeLabel(fileType)}</p>
                            <p className="mt-1 text-xs text-slate-500">{generatedFiles.length} generated file{generatedFiles.length === 1 ? '' : 's'}</p>
                          </div>
                          <Badge tone="purple">{fileTypeLabel(fileType)}</Badge>
                        </div>

                        <div className="space-y-4">
                          {generatedFiles.map((file) => (
                            <article key={file.id || file.file_path || file.file_name} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                              <div className="grid gap-3 border-b border-slate-800 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                                <div className="flex min-w-0 items-start gap-3">
                                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10">
                                    <FileCode2 className="h-4 w-4 text-cyan-300" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-100">{file.file_name}</p>
                                    <p className="mt-1 truncate text-xs text-slate-500">{file.file_path}</p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                  <Link to={file.id ? `/app/generated-files/${file.id}` : '#'} className={!file.id ? 'pointer-events-none' : ''}>
                                    <Button size="sm" variant="ghost" icon={Eye} disabled={!file.id}>Preview</Button>
                                  </Link>
                                  <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadFile(file)} disabled={!file.id}>Download</Button>
                                  <div className="relative inline-flex">
                                    {copiedFileId === file.id ? (
                                      <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-950/30">
                                        Code copied
                                      </div>
                                    ) : null}
                                    <Button size="sm" variant="primary" icon={Copy} onClick={() => copyFile(file)} disabled={!file.id}>Copy</Button>
                                  </div>
                                  <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => regenerateFile(file)} disabled={!file.id || !projectId}>Regenerate</Button>
                                </div>
                              </div>
                              <pre className="max-h-96 overflow-auto p-4 text-xs leading-5 text-slate-300"><code>{file.content || 'File content is empty.'}</code></pre>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {otherProjects.length ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/50">
                <div className="border-b border-slate-800 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-100">Other Projects</p>
                  <p className="mt-1 text-xs text-slate-500">Open another project's generated files.</p>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {otherProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => loadFilesForProject(project.id)}
                      className="min-w-0 rounded-md border border-slate-800 bg-slate-900/60 p-3 text-left transition hover:border-cyan-400/50 hover:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">{project.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{project.stack || project.description || 'No stack details recorded'}</p>
                        </div>
                        <FileCode2 className="h-4 w-4 shrink-0 text-cyan-300" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="cyan">{project.deployment_type || 'project'}</Badge>
                        <Badge tone="slate">{project.environment || 'env'}</Badge>
                        {project.github_repo_url ? <Badge tone="purple">GitHub</Badge> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
