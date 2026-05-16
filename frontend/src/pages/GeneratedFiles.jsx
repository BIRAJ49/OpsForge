import { AlertTriangle, CheckCircle2, Copy, Download, Eye, FileCode2, GitBranch, Info, RefreshCw, Rocket, X } from 'lucide-react'
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
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [fileOptions, setFileOptions] = useState([])
  const [selectedFilePaths, setSelectedFilePaths] = useState([])
  const [projectId, setProjectId] = useState(null)
  const [copiedFileId, setCopiedFileId] = useState(null)

  const showMessage = useCallback((text, tone = 'info') => {
    setMessage(text)
    setMessageTone(tone)
  }, [])

  const loadFilesForProject = useCallback(async (nextProjectId, options = {}) => {
    if (!nextProjectId) {
      setFiles([])
      setProjectId(null)
      return
    }

    const normalizedProjectId = String(nextProjectId)
    setFilesLoading(true)
    setOptionsLoading(true)
    setProjectId(normalizedProjectId)
    setFiles([])
    setFileOptions([])
    setSelectedFilePaths([])
    localStorage.setItem('opsforge_last_project_id', normalizedProjectId)
    if (!options.keepMessage) setMessage('')

    try {
      const [generatedResponse, optionsResponse] = await Promise.all([
        api.get(`/projects/${normalizedProjectId}/generated-files`),
        api.get(`/projects/${normalizedProjectId}/generate/options`),
      ])
      const generatedFiles = unwrap(generatedResponse)
      const availableOptions = unwrap(optionsResponse)
      setFiles(generatedFiles)
      setFileOptions(availableOptions)
      setSelectedFilePaths(availableOptions.map((option) => option.file_path))
      if (!generatedFiles.length) {
        showMessage('No generated files for this project yet.', 'info')
      }
    } catch (error) {
      showMessage(apiErrorMessage(error, 'Could not load generated files'), 'error')
    } finally {
      setFilesLoading(false)
      setOptionsLoading(false)
    }
  }, [showMessage])

  useEffect(() => {
    async function loadProjects() {
      setLoading(true)
      try {
        const data = unwrap(await api.get('/projects'))
        setProjects(data)

        const lastProjectId = localStorage.getItem('opsforge_last_project_id')
        const initialProject = data.find((project) => String(project.id) === String(lastProjectId)) || data[0]
        if (!initialProject) {
          setFiles([])
          setProjectId(null)
          showMessage('Create a project first, then generate DevOps files.', 'info')
          return
        }

        await loadFilesForProject(initialProject.id)
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

  async function generateProjectFiles() {
    if (!projectId) return
    if (!selectedFilePaths.length) {
      showMessage('Select at least one file to generate.', 'error')
      return
    }
    try {
      const data = unwrap(await api.post(`/projects/${projectId}/generate`, { selected_file_paths: selectedFilePaths }))
      setFiles(data)
      showMessage(`Generated ${data.length} selected file${data.length === 1 ? '' : 's'} for the selected project.`, 'success')
    } catch (error) {
      showMessage(apiErrorMessage(error, 'Could not generate project files'), 'error')
    }
  }

  function toggleFilePath(filePath) {
    setSelectedFilePaths((current) => (
      current.includes(filePath)
        ? current.filter((path) => path !== filePath)
        : [...current, filePath]
    ))
  }

  function selectFileType(fileType) {
    const paths = fileOptions.filter((option) => option.file_type === fileType).map((option) => option.file_path)
    setSelectedFilePaths((current) => Array.from(new Set([...current, ...paths])))
  }

  function clearFileType(fileType) {
    const paths = new Set(fileOptions.filter((option) => option.file_type === fileType).map((option) => option.file_path))
    setSelectedFilePaths((current) => current.filter((path) => !paths.has(path)))
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
  const groupedFileOptions = fileOptions.reduce((groups, option) => {
    const key = option.file_type || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(option)
    return groups
  }, {})
  const selectedCount = selectedFilePaths.length
  const generatedPaths = new Set(files.map((file) => file.file_path))

  return (
    <Card>
      <CardHeader
        title="Generated Files"
        description="Choose a project, select files, then generate only what should belong to that project."
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Download} onClick={downloadAllFiles} disabled={!projectId || !files.length}>Download ZIP</Button>
            <Button variant="secondary" icon={GitBranch} onClick={pushToGitHub} disabled={!projectId}>Push to GitHub</Button>
          </div>
        )}
      />
      <CardContent>
        {message ? <StatusMessage tone={messageTone} message={message} onClose={() => setMessage('')} /> : null}
        {loading ? <div className="py-8 text-center text-sm text-slate-400">Loading projects...</div> : null}
        {!loading ? (
          <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-950/50">
                <div className="border-b border-slate-800 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-100">Project</p>
                </div>
                <div className="space-y-3 p-3">
                  <select
                    value={projectId || ''}
                    onChange={(event) => loadFilesForProject(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                    disabled={!projects.length}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                  {selectedProject ? (
                    <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
                      <p className="truncate text-sm font-semibold text-slate-100">{selectedProject.name}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="cyan">{selectedProject.deployment_type || 'project'}</Badge>
                        <Badge tone="slate">{selectedProject.environment || 'env'}</Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                      No projects yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/50">
                <div className="grid grid-cols-2 divide-x divide-slate-800 text-center">
                  <div className="p-3">
                    <p className="text-lg font-semibold text-slate-100">{selectedCount}</p>
                    <p className="mt-1 text-xs text-slate-500">Selected</p>
                  </div>
                  <div className="p-3">
                    <p className="text-lg font-semibold text-slate-100">{files.length}</p>
                    <p className="mt-1 text-xs text-slate-500">Generated</p>
                  </div>
                </div>
                <div className="border-t border-slate-800 p-3">
                  <Button className="w-full" icon={Rocket} onClick={generateProjectFiles} disabled={!projectId || !selectedCount}>
                    Generate Selected
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/50">
                <div className="border-b border-slate-800 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-100">Projects</p>
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto p-3">
                  {projects.map((project) => {
                    const active = String(project.id) === String(projectId)
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => loadFilesForProject(project.id)}
                        className={`w-full rounded-md border px-3 py-2 text-left transition ${
                          active
                            ? 'border-cyan-400/60 bg-cyan-400/10'
                            : 'border-slate-800 bg-slate-900/60 hover:border-cyan-400/40 hover:bg-slate-900'
                        }`}
                      >
                        <span className="block truncate text-sm font-medium text-slate-100">{project.name}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{project.deployment_type || 'project'} / {project.environment || 'env'}</span>
                      </button>
                    )
                  })}
                  {!projects.length ? (
                    <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                      Create a project first.
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>

            <div className="min-w-0 space-y-5">
              <div className="rounded-lg border border-slate-800 bg-slate-950/50">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Files to Generate</p>
                    <p className="mt-1 text-xs text-slate-400">{selectedCount} of {fileOptions.length} selected</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedFilePaths(fileOptions.map((option) => option.file_path))} disabled={!fileOptions.length}>Select All</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedFilePaths([])} disabled={!fileOptions.length}>Clear</Button>
                    <Button size="sm" icon={Rocket} onClick={generateProjectFiles} disabled={!projectId || !selectedCount}>Generate</Button>
                  </div>
                </div>
                {optionsLoading ? (
                  <div className="p-4 text-sm text-slate-400">Loading generation options...</div>
                ) : (
                  <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {Object.entries(groupedFileOptions).map(([fileType, options]) => {
                      const selectedInGroup = options.filter((option) => selectedFilePaths.includes(option.file_path)).length
                      return (
                        <section key={fileType} className="min-w-0 rounded-md border border-slate-800 bg-slate-900/50">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold uppercase text-slate-300">{fileTypeLabel(fileType)}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{selectedInGroup}/{options.length} selected</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button type="button" onClick={() => selectFileType(fileType)} className="text-xs font-medium text-cyan-200 hover:text-white">All</button>
                              <button type="button" onClick={() => clearFileType(fileType)} className="text-xs font-medium text-slate-400 hover:text-white">None</button>
                            </div>
                          </div>
                          <div className="max-h-56 space-y-1 overflow-y-auto p-2">
                            {options.map((option) => {
                              const checked = selectedFilePaths.includes(option.file_path)
                              const generated = generatedPaths.has(option.file_path)
                              return (
                                <label key={option.file_path} className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition ${checked ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-transparent hover:border-slate-700 hover:bg-slate-900'}`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleFilePath(option.file_path)}
                                    className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-400 focus:ring-cyan-400"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span className="truncate font-medium text-slate-100">{option.file_name}</span>
                                      {generated ? <span className="shrink-0 rounded border border-emerald-400/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">Ready</span> : null}
                                    </span>
                                    <span className="block truncate text-xs text-slate-500">{option.file_path}</span>
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </section>
                      )
                    })}
                    {!fileOptions.length ? (
                      <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                        No generation options are available for this project.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

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
                      Select files above and generate them for the selected project.
                    </p>
                    <Button className="mt-5" icon={Rocket} onClick={generateProjectFiles} disabled={!selectedCount}>Generate Selected</Button>
                  </div>
                ) : null}

                {!filesLoading && files.length ? (
                  <div className="divide-y divide-slate-800">
                    {files.map((file) => (
                      <div key={file.id || file.file_name} className="grid gap-3 px-4 py-3 transition hover:bg-slate-900/60 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
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
                          <Badge tone="purple">{fileTypeLabel(file.file_type)}</Badge>
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
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
