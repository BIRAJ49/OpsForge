import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { securityIssues } from '../data/mockData'
import { api, unwrap } from '../services/api'

export default function Security() {
  const [scans, setScans] = useState([])
  const [issues, setIssues] = useState(securityIssues)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadScans() {
      try {
        const data = unwrap(await api.get('/security/scans'))
        setScans(data)
        if (data.length) {
          setIssues(data.map((scan) => ({
            issue: `${scan.scan_type} scan ${scan.status}`,
            severity: scan.critical_count ? 'Critical' : scan.high_count ? 'High' : scan.medium_count ? 'Medium' : 'Low',
            resource: `Project ${scan.project_id}`,
            recommendation: scan.status === 'completed' ? 'Review Trivy result JSON and patch vulnerabilities.' : 'Check scanner configuration.',
            status: scan.status,
          })))
        }
      } catch (error) {
        setMessage(error.response?.data?.message || 'Could not load security scans')
      }
    }
    loadScans()
  }, [])

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
        <CardHeader title="Security Issues" description="Container, Kubernetes, secrets, and policy scan results." />
        <CardContent>
          {message ? <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">{message}</div> : null}
          <Table
            columns={[
              { key: 'issue', header: 'Issue', render: (row) => <span className="font-medium text-slate-100">{row.issue}</span> },
              { key: 'severity', header: 'Severity', render: (row) => <StatusBadge status={row.severity} /> },
              { key: 'resource', header: 'Resource' },
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
