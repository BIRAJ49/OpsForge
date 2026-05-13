import { AlertTriangle, CheckCircle2, Copy, Download, Eye, FileCode2, GitBranch, Info, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
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

export default function GeneratedFiles() {
  const [files, setFiles] = useState([])
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')
  const [loading, setLoading] = useState(true)
  const [projectId, setProjectId] = useState(null)
  const [copiedFileId, setCopiedFileId] = useState(null)

  function showMessage(text, tone = 'info') {
    setMessage(text)
    setMessageTone(tone)
  }

  useEffect(() => {
    async function loadFiles() {
      setLoading(true)
      try {
        let projectId = localStorage.getItem('opsforge_last_project_id')
        if (!projectId) {
          const projects = unwrap(await api.get('/projects'))
          projectId = projects[0]?.id
        }
        if (!projectId) {
          setFiles([])
          showMessage('Create a project first, then generate DevOps files.', 'info')
          return
        }
        setProjectId(projectId)
        const data = unwrap(await api.get(`/projects/${projectId}/generated-files`))
        setFiles(data)
        if (data.length) {
          setMessage('')
        } else {
          showMessage('No generated files yet. Generate files from the Projects page.', 'info')
        }
      } catch (error) {
        showMessage(error.response?.data?.message || 'Could not load generated files', 'error')
      } finally {
        setLoading(false)
      }
    }
    loadFiles()
  }, [])

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

  return (
    <Card>
      <CardHeader
        title="Generated Files"
        description="Generated DevOps lifecycle files ready for review, copy, download, regeneration, or GitHub push."
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Download} onClick={downloadAllFiles} disabled={!projectId || !files.length}>Download ZIP</Button>
            <Button variant="secondary" icon={GitBranch} onClick={pushToGitHub} disabled={!projectId}>Push to GitHub</Button>
          </div>
        )}
      />
      <CardContent>
        {message ? <StatusMessage tone={messageTone} message={message} onClose={() => setMessage('')} /> : null}
        {loading ? <div className="py-8 text-center text-sm text-slate-400">Loading generated files...</div> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {files.map((file) => (
            <div key={file.id || file.file_name} className="flex min-h-44 flex-col justify-between rounded-lg border border-slate-800 bg-slate-950/70 p-4 transition hover:border-cyan-400/40 hover:bg-slate-950">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10">
                  <FileCode2 className="h-5 w-5 text-cyan-300" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-100">{file.file_name}</p>
                  <Badge tone="purple" className="mt-2">{file.file_type}</Badge>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link to={file.id ? `/app/generated-files/${file.id}` : '#'} className={!file.id ? 'pointer-events-none' : ''}>
                  <Button size="sm" variant="ghost" icon={Eye} disabled={!file.id} className="w-full">Preview</Button>
                </Link>
                <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadFile(file)} disabled={!file.id} className="w-full">Download</Button>
                <div className="relative inline-flex w-full">
                  {copiedFileId === file.id ? (
                    <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-950/30">
                      Code copied
                    </div>
                  ) : null}
                  <Button size="sm" variant="primary" icon={Copy} onClick={() => copyFile(file)} disabled={!file.id} className="w-full">Copy</Button>
                </div>
                <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => regenerateFile(file)} disabled={!file.id || !projectId} className="w-full">Regenerate</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
