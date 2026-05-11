import { useEffect, useState } from 'react'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { k8sResources, pods } from '../data/mockData'
import { api, unwrap } from '../services/api'

export default function Kubernetes() {
  const [resources, setResources] = useState(k8sResources)
  const [podRows, setPodRows] = useState(pods)

  useEffect(() => {
    async function loadKubernetes() {
      const resourceNames = ['pods', 'deployments', 'services', 'ingress', 'configmaps', 'secrets', 'hpa']
      try {
        const loaded = await Promise.all(resourceNames.map(async (name) => {
          const result = unwrap(await api.get(`/kubernetes/${name}`))
          return { label: name === 'hpa' ? 'HPA' : name[0].toUpperCase() + name.slice(1), value: result.items?.length || 0, status: result.status || 'loaded' }
        }))
        setResources(loaded)
        const podData = unwrap(await api.get('/kubernetes/pods'))
        setPodRows((podData.items || []).map((pod) => ({
          name: pod.name,
          namespace: pod.namespace,
          status: pod.status || 'Running',
          restarts: pod.restarts ?? 0,
          cpu: pod.cpu || 'mock',
          memory: pod.memory || 'mock',
          age: pod.age || 'mock',
        })))
      } catch {
        setResources(k8sResources)
        setPodRows(pods)
      }
    }
    loadKubernetes()
  }, [])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resources.map((resource) => (
          <Card key={resource.label} hover>
            <CardContent>
              <p className="text-sm text-slate-400">{resource.label}</p>
              <p className="mt-2 text-3xl font-bold text-white">{resource.value}</p>
              <p className="mt-2 text-xs text-slate-500">{resource.status}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Pods" description="Runtime pod status, resource usage, restarts, and age." />
        <CardContent>
          <Table
            columns={[
              { key: 'name', header: 'Pod name', render: (row) => <span className="font-mono text-xs text-slate-100">{row.name}</span> },
              { key: 'namespace', header: 'Namespace' },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              { key: 'restarts', header: 'Restarts' },
              { key: 'cpu', header: 'CPU' },
              { key: 'memory', header: 'Memory' },
              { key: 'age', header: 'Age' },
            ]}
            data={podRows}
          />
        </CardContent>
      </Card>
    </div>
  )
}
