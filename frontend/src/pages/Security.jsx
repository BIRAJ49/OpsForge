import { Play, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { api, apiErrorMessage, unwrap } from '../services/api'

export default function Security() {
  const [scans, setScans] = useState([])
  const [issues, setIssues] = useState([])
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [message, setMessage] = useState('')
  const [scanLoading, setScanLoading] = useState(false)

  const applyScans = useCallback((scanData, projectData = []) => {
    setScans(scanData)
    if (scanData.length) {
      setIssues(scanData.map((scan) => {
        const project = projectData.find((item) => item.id === scan.project_id)
        const total = scan.critical_count + scan.high_count + scan.medium_count + scan.low_count
        const target = scan.result_json?.ArtifactName || scan.result_json?.ArtifactID || 'Container image'
        const scannerError = scan.result_json?.error || scan.result_json?.stderr
        return {
          issue: `${scan.scan_type} scan ${scan.status}`,
          severity: scan.critical_count ? 'Critical' : scan.high_count ? 'High' : scan.medium_count ? 'Medium' : 'Low',
          resource: project ? project.name : `Project ${scan.project_id}`,
          target,
          recommendation: scan.status === 'completed'
            ? `${total} findings. Review packages, rebuild patched images, and redeploy through GitOps.`
            : scannerError || 'Check Trivy, image visibility, and registry authentication.',
          status: scan.status,
        }
      }))
    } else {
      setIssues([])
    }
  }, [])

  useEffect(() => {
    async function loadSecurityData() {
      try {
        const [scanResponse, projectResponse] = await Promise.all([
          api.get('/security/scans'),
          api.get('/projects'),
        ])
        const scanData = unwrap(scanResponse)
        const projectData = unwrap(projectResponse)
        setProjects(projectData)
        if (projectData.length) setSelectedProjectId((value) => value || String(projectData[0].id))
        applyScans(scanData, projectData)
      } catch (error) {
        setMessage(apiErrorMessage(error, 'Could not load security scans'))
      }
    }
    loadSecurityData()
  }, [applyScans])

  async function runScan() {
    if (!selectedProjectId) {
      setMessage('Select a project before running a scan.')
      return
    }
    setMessage('')
    setScanLoading(true)
    try {
      const created = unwrap(await api.post(`/security/scan/project/${selectedProjectId}?scan_type=image`))
      const nextScans = [created, ...scans.filter((scan) => scan.id !== created.id)]
      applyScans(nextScans, projects)
      setMessage(created.status === 'completed' ? 'Trivy scan completed.' : 'Trivy scan failed. Review the result details below.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Could not run Trivy scan'))
    } finally {
      setScanLoading(false)
    }
  }

  const totals = scans.reduce((acc, scan) => ({
    critical: acc.critical + scan.critical_count,
    high: acc.high + scan.high_count,
    medium: acc.medium + scan.medium_count,
    low: acc.low + scan.low_count,
  }), { critical: 0, high: 0, medium: 0, low: 0 })

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ['Security score', scans.length ? 'Live' : '82/100'],
          ['Vulnerability count', scans.length ? String(totals.critical + totals.high + totals.medium + totals.low) : '31'],
          ['Trivy scan results', scans.length ? `${totals.high} high` : '8 high'],
          ['Critical findings', scans.length ? String(totals.critical) : '5 open'],
          ['Policy violations', scans.length ? 'API-backed' : '3 blocked'],
        ].map(([label, value]) => (
          <Card key={label} hover>
            <CardContent>
              <div className="flex items-center justify-between">
                <ShieldCheck className="h-5 w-5 text-cyan-300" />
                <TriangleAlert className="h-4 w-4 text-amber-300" />
              </div>
              <p className="mt-4 text-sm text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-bold text-white">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader
          title="Security Issues"
          description="Container image vulnerability scans powered by Trivy."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
              >
                {projects.length ? projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                )) : <option value="">No projects</option>}
              </select>
              <Button icon={Play} loading={scanLoading} onClick={runScan}>Run Trivy Scan</Button>
            </div>
          }
        />
        <CardContent>
          {message ? <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          <Table
            columns={[
              { key: 'issue', header: 'Issue', render: (row) => <span className="font-medium text-slate-100">{row.issue}</span> },
              { key: 'severity', header: 'Severity', render: (row) => <StatusBadge status={row.severity} /> },
              { key: 'resource', header: 'Resource' },
              { key: 'target', header: 'Target' },
              { key: 'recommendation', header: 'Recommendation' },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            data={issues}
          />
        </CardContent>
      </Card>
    </div>
  )
}
