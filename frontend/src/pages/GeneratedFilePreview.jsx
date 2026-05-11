import { ArrowLeft, Copy, Download, FileCode2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { api, apiErrorMessage, unwrap } from '../services/api'

export default function GeneratedFilePreview() {
  const { fileId } = useParams()
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFile() {
      setLoading(true)
      setMessage('')
      try {
        setFile(unwrap(await api.get(`/generated-files/${fileId}`)))
      } catch (error) {
        setMessage(apiErrorMessage(error, 'Could not load generated file'))
      } finally {
        setLoading(false)
      }
    }
    loadFile()
  }, [fileId])

  async function copyFile() {
    await navigator.clipboard.writeText(file?.content || '')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  async function downloadFile() {
    try {
      const response = await api.get(`/generated-files/${fileId}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = file?.file_name || 'generated-file.txt'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not download file'))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/app/generated-files">
          <Button variant="secondary" icon={ArrowLeft}>Back to files</Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Download} onClick={downloadFile} disabled={!file}>Download</Button>
          <div className="relative inline-flex">
            {copied ? (
              <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-400/40 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-950/30">
                Code copied
              </div>
            ) : null}
            <Button icon={Copy} onClick={copyFile} disabled={!file}>Copy</Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader
          title={file?.file_path || 'Generated File Preview'}
          description="Isolated preview for this generated DevOps file."
          action={file ? <Badge tone="purple">{file.file_type}</Badge> : null}
        />
        <CardContent>
          {message ? <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading generated file...</div>
          ) : file ? (
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
                <FileCode2 className="h-4 w-4 text-cyan-300" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{file.file_name}</p>
                  <p className="truncate text-xs text-slate-500">{file.file_path}</p>
                </div>
              </div>
              <pre className="max-h-[calc(100vh-290px)] min-h-[420px] overflow-auto p-4 text-xs leading-5 text-slate-300">{file.content}</pre>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-400">Generated file not found.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
