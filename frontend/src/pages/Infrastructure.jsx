import { AlertTriangle, Cloud, Server } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { terraformModules } from '../data/mockData'
import { api, unwrap } from '../services/api'

export default function Infrastructure() {
  const [templates, setTemplates] = useState(terraformModules)
  const [preview, setPreview] = useState('')

  useEffect(() => {
    async function loadTemplates() {
      try {
        const data = unwrap(await api.get('/infrastructure/templates'))
        setTemplates(data.map((template) => ({
          name: template.name,
          resource: template.id,
          status: 'Active',
          cost: 'placeholder',
          content: template.content,
        })))
        setPreview(data[0]?.content || '')
      } catch {
        setTemplates(terraformModules)
      }
    }
    loadTemplates()
  }, [])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {['VPC', 'EC2', 'S3', 'IAM', 'EKS', 'RDS', 'Load balancer', 'AWS resources'].map((item) => (
          <Card key={item} hover>
            <CardContent>
              <Cloud className="h-5 w-5 text-cyan-300" />
              <p className="mt-4 text-sm text-slate-400">{item}</p>
              <p className="mt-2 text-2xl font-bold text-white">{item === 'AWS resources' ? 128 : 'Active'}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title="Terraform Modules" description="Managed infrastructure modules and monthly cost." />
          <CardContent>
            <Table
              columns={[
                { key: 'name', header: 'Module', render: (row) => <span className="font-medium text-slate-100">{row.name}</span> },
                { key: 'resource', header: 'Resource' },
                { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                { key: 'cost', header: 'Cost' },
              ]}
              data={templates}
            />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Terraform Plan Preview" />
            <CardContent>
              <pre className="overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-cyan-100 custom-scrollbar">{preview || `Plan: 4 to add, 2 to change, 0 to destroy

+ aws_eks_node_group.platform_gpu
~ aws_db_instance.payments
+ aws_cloudwatch_metric_alarm.db_pool`}</pre>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-300" />
                <div>
                  <h2 className="font-semibold text-amber-100">Cost warning</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Projected spend increases by $418/month after adding GPU node capacity and larger RDS storage.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-emerald-300" />
                <div>
                  <p className="font-semibold text-white">Infrastructure healthy</p>
                  <p className="text-sm text-slate-500">126 of 128 resources compliant</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
