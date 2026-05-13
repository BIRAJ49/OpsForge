import { useEffect, useState } from 'react'
import { FileText, History, PlusCircle, RefreshCw, RotateCcw, ShieldAlert, X } from 'lucide-react'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Table } from '../components/ui/Table'
import { Button } from '../components/ui/Button'
import { k8sResources, pods } from '../data/mockData'
import { api, apiErrorMessage, unwrap } from '../services/api'

export default function Kubernetes() {
  const [resources, setResources] = useState(k8sResources)
  const [podRows, setPodRows] = useState(pods)
  const [selectedPod, setSelectedPod] = useState(null)
  const [podPanel, setPodPanel] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelError, setPanelError] = useState('')
  const [incidentScan, setIncidentScan] = useState(null)
  const [incidentError, setIncidentError] = useState('')
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [incidentActionMessage, setIncidentActionMessage] = useState('')
  const [createdIncidentIds, setCreatedIncidentIds] = useState({})
  const [requestedRestartIds, setRequestedRestartIds] = useState({})

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

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = unwrap(await api.get('/projects'))
        const loadedProjects = data || []
        setProjects(loadedProjects)
        if (loadedProjects.length && !selectedProjectId) {
          setSelectedProjectId(String(loadedProjects[0].id))
        }
      } catch {
        setProjects([])
      }
    }
    loadProjects()
  }, [])

  async function loadPodLogs(row) {
    setSelectedPod(row)
    setPodPanel({ type: 'logs', pod: row, data: null })
    setPanelLoading(true)
    setPanelError('')
    try {
      const data = unwrap(await api.get(`/kubernetes/pods/${encodeURIComponent(row.name)}/logs`))
      setPodPanel({ type: 'logs', pod: row, data })
    } catch (error) {
      setPanelError(apiErrorMessage(error, 'Could not load pod logs'))
    } finally {
      setPanelLoading(false)
    }
  }

  async function loadPodEvents(row) {
    setSelectedPod(row)
    setPodPanel({ type: 'events', pod: row, data: null })
    setPanelLoading(true)
    setPanelError('')
    try {
      const data = unwrap(await api.get(`/kubernetes/pods/${encodeURIComponent(row.name)}/events`))
      setPodPanel({ type: 'events', pod: row, data })
    } catch (error) {
      setPanelError(apiErrorMessage(error, 'Could not load pod events'))
    } finally {
      setPanelLoading(false)
    }
  }

  function refreshPodPanel() {
    if (!selectedPod || !podPanel) return undefined
    return podPanel.type === 'logs' ? loadPodLogs(selectedPod) : loadPodEvents(selectedPod)
  }

  function closePodPanel() {
    setSelectedPod(null)
    setPodPanel(null)
    setPanelError('')
    setPanelLoading(false)
  }

  async function analyzeClusterIncidents() {
    setIncidentError('')
    setIncidentActionMessage('')
    try {
      const result = unwrap(await api.post('/kubernetes/incidents/analyze'))
      setIncidentScan(result)
    } catch (error) {
      setIncidentError(apiErrorMessage(error, 'Could not analyze Kubernetes incidents'))
    }
  }

  function incidentEvidence(incident) {
    return [
      `Pod: ${incident.pod_name}`,
      `Namespace: ${incident.namespace}`,
      `Status: ${incident.status}`,
      `Phase: ${incident.phase}`,
      `Ready: ${incident.ready}`,
      `Restarts: ${incident.restarts}`,
      `Suggested fix: ${incident.suggested_fix}`,
      `Recommended command: ${incident.recommended_command}`,
      ...(incident.events || []).map((event) => `Event: ${event}`),
    ].join('\n')
  }

  async function createSavedIncident(incident) {
    setIncidentActionMessage('')
    if (!selectedProjectId) {
      setIncidentActionMessage('Select a project before creating an incident.')
      return
    }
    try {
      const created = unwrap(await api.post('/incidents', {
        project_id: Number(selectedProjectId),
        title: `Kubernetes issue: ${incident.pod_name}`,
        severity: incident.severity.toLowerCase(),
        affected_service: `${incident.namespace}/${incident.pod_name}`,
        root_cause_summary: incident.likely_cause,
        source: 'kubernetes',
        evidence: incidentEvidence(incident),
      }))
      setCreatedIncidentIds((current) => ({ ...current, [incident.id]: created.id }))
      setIncidentActionMessage(`Incident #${created.id} created for ${incident.pod_name}.`)
    } catch (error) {
      setIncidentActionMessage(apiErrorMessage(error, 'Could not create incident'))
    }
  }

  async function requestRestart(incident) {
    setIncidentActionMessage('')
    try {
      const action = unwrap(await api.post('/healing/actions', {
        project_id: selectedProjectId ? Number(selectedProjectId) : null,
        incident_id: createdIncidentIds[incident.id] || null,
        action_type: 'restart deployment',
        parameters: {
          namespace: incident.namespace,
          pod_name: incident.pod_name,
          status: incident.status,
          source: 'kubernetes_incident_analysis',
          recommended_command: `kubectl rollout restart deployment/<deployment-name> -n ${incident.namespace}`,
          evidence_command: incident.recommended_command,
        },
      }))
      setRequestedRestartIds((current) => ({ ...current, [incident.id]: action.id }))
      setIncidentActionMessage(`Restart request #${action.id} recorded for ${incident.pod_name}.`)
    } catch (error) {
      setIncidentActionMessage(apiErrorMessage(error, 'Could not request restart'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Kubernetes</h1>
          <p className="mt-1 text-sm text-slate-400">Live cluster resources, pod diagnostics, and rule-based incident detection.</p>
        </div>
        <Button icon={ShieldAlert} onClick={analyzeClusterIncidents}>
          Analyze Cluster Incidents
        </Button>
      </div>
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
      {(incidentScan || incidentError) ? (
        <Card>
          <CardHeader
            title="Cluster Incident Analysis"
            description="Rule-based analysis from live pod status, restart counts, readiness, and Kubernetes events."
          />
          <CardContent>
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">Incident actions</p>
                <p className="mt-1 text-xs text-slate-500">Saved incidents need a project owner. Restart requests are recorded for manual approval/execution.</p>
              </div>
              <select
                className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                {projects.length ? projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                )) : <option value="">No projects available</option>}
              </select>
            </div>
            {incidentActionMessage ? (
              <div className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-sm text-cyan-100">
                {incidentActionMessage}
              </div>
            ) : null}
            {incidentError ? (
              <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                {incidentError}
              </div>
            ) : null}
            {incidentScan ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Pods checked</p>
                    <p className="mt-2 text-2xl font-bold text-white">{incidentScan.summary?.pods_checked ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Incidents found</p>
                    <p className="mt-2 text-2xl font-bold text-white">{incidentScan.summary?.incidents_found ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Healthy pods</p>
                    <p className="mt-2 text-2xl font-bold text-white">{incidentScan.summary?.healthy_pods ?? 0}</p>
                  </div>
                </div>
                {incidentScan.summary?.ai ? (
                  <div className={`rounded-lg border p-4 text-sm ${
                    incidentScan.summary.ai.assisted_incidents
                      ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
                      : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                  }`}>
                    <p className="font-semibold">
                      {incidentScan.summary.ai.assisted_incidents
                        ? `AI assisted ${incidentScan.summary.ai.assisted_incidents} incident${incidentScan.summary.ai.assisted_incidents === 1 ? '' : 's'}`
                        : 'Using rule-based fallback'}
                    </p>
                    <p className="mt-1 text-xs opacity-80">
                      Provider: {incidentScan.summary.ai.provider || 'rule_based'} · enabled: {String(incidentScan.summary.ai.enabled)} · attempted: {String(incidentScan.summary.ai.attempted)}
                      {incidentScan.summary.ai.last_error ? ` · last error: ${incidentScan.summary.ai.last_error}` : ''}
                    </p>
                  </div>
                ) : null}
                {(incidentScan.incidents || []).length ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {incidentScan.incidents.map((incident) => (
                      <div key={incident.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-mono text-sm font-semibold text-slate-100">{incident.pod_name}</p>
                              {incident.ai_assisted ? (
                                <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100">
                                  AI-assisted
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{incident.namespace} · {incident.status} · ready {incident.ready} · restarts {incident.restarts}</p>
                          </div>
                          <StatusBadge status={incident.severity} />
                        </div>
                        <div className="mt-4 space-y-3 text-sm text-slate-400">
                          <p><span className="text-slate-200">Likely cause:</span> {incident.likely_cause}</p>
                          <p><span className="text-slate-200">Suggested fix:</span> {incident.suggested_fix}</p>
                          {incident.ai_assisted ? (
                            <p className="text-xs text-slate-500">
                              AI model: {incident.ai_model} · confidence {incident.ai_confidence || 'medium'}
                            </p>
                          ) : incident.ai_fallback_reason ? (
                            <p className="rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                              Rule-based fallback: {incident.ai_fallback_reason}
                            </p>
                          ) : null}
                          <pre className="custom-scrollbar overflow-auto rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-cyan-100">{incident.recommended_command}</pre>
                          {incident.events?.length ? (
                            <div>
                              <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Recent events</p>
                              <ul className="space-y-1">
                                {incident.events.map((event) => (
                                  <li key={event} className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">{event}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <Button
                              size="sm"
                              variant={createdIncidentIds[incident.id] ? 'secondary' : 'primary'}
                              icon={PlusCircle}
                              onClick={() => createSavedIncident(incident)}
                              disabled={!selectedProjectId || Boolean(createdIncidentIds[incident.id])}
                            >
                              {createdIncidentIds[incident.id] ? `Incident #${createdIncidentIds[incident.id]}` : 'Create Incident'}
                            </Button>
                            <Button
                              size="sm"
                              variant={requestedRestartIds[incident.id] ? 'secondary' : 'warning'}
                              icon={RotateCcw}
                              onClick={() => requestRestart(incident)}
                              disabled={Boolean(requestedRestartIds[incident.id])}
                            >
                              {requestedRestartIds[incident.id] ? `Restart #${requestedRestartIds[incident.id]}` : 'Request Restart'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                    No Kubernetes incidents detected from current pod status and events.
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Pods" description="Runtime pod status, resource usage, restarts, and age." />
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-cyan-400/30 bg-slate-950/80">
            <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {podPanel ? (podPanel.type === 'logs' ? 'Pod Logs' : 'Pod Events') : 'Pod Logs & Events'}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {selectedPod ? `${selectedPod.namespace}/${selectedPod.name}` : 'Select Logs or Events from a pod row below'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" icon={RefreshCw} onClick={refreshPodPanel} disabled={!podPanel}>
                  Refresh
                </Button>
                {selectedPod ? (
                  <Button size="icon" variant="ghost" icon={X} onClick={closePodPanel} aria-label="Close pod diagnostics" />
                ) : null}
              </div>
            </div>
            <div className="p-4">
              {!selectedPod ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-8 text-center text-sm text-slate-400">
                  Click a pod&apos;s Logs button to show its latest container output here. Click Events to show Kubernetes scheduling and runtime events.
                </div>
              ) : null}
              {panelError ? (
                <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                  {panelError}
                </div>
              ) : null}
              {panelLoading ? (
                <div className="flex min-h-32 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/70 text-sm text-cyan-100">
                  <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
                  Loading pod diagnostics
                </div>
              ) : null}
              {!panelLoading && podPanel?.data?.status === 'error' ? (
                <div className="mb-3 rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {podPanel.data.message || 'Kubernetes returned an error for this pod.'}
                </div>
              ) : null}
              {!panelLoading && podPanel?.type === 'logs' ? (
                <pre className="custom-scrollbar max-h-[420px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-6 text-slate-300">
                  {(podPanel.data?.logs || ['No logs available.']).join('\n')}
                </pre>
              ) : null}
              {!panelLoading && podPanel?.type === 'events' ? (
                <div className="custom-scrollbar max-h-[420px] overflow-auto rounded-lg border border-slate-800">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">Count</th>
                        <th className="px-4 py-3">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                      {(podPanel.data?.events || []).length ? podPanel.data.events.map((event, index) => (
                        <tr key={`${event.reason || 'event'}-${index}`} className="align-top">
                          <td className="px-4 py-3 text-slate-300">{event.type || 'Normal'}</td>
                          <td className="px-4 py-3 text-slate-100">{event.reason || 'Event'}</td>
                          <td className="px-4 py-3 text-slate-300">{event.count || 1}</td>
                          <td className="whitespace-normal px-4 py-3 text-slate-400">{event.message || 'No message available.'}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No events available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
          <Table
            columns={[
              {
                key: 'actions',
                header: 'Actions',
                render: (row) => (
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800/80 px-3 text-xs font-medium text-slate-100 transition hover:border-cyan-500/60 hover:bg-slate-800"
                      onClick={() => loadPodLogs(row)}
                      type="button"
                    >
                      <FileText className="h-4 w-4" />
                      Logs
                    </button>
                    <button
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-transparent bg-transparent px-3 text-xs font-medium text-slate-300 transition hover:bg-slate-800/80 hover:text-white"
                      onClick={() => loadPodEvents(row)}
                      type="button"
                    >
                      <History className="h-4 w-4" />
                      Events
                    </button>
                  </div>
                ),
              },
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
      {selectedPod ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-4xl flex-col border-l border-cyan-400/30 bg-slate-950 shadow-2xl shadow-slate-950">
            <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {podPanel?.type === 'events' ? 'Pod Events' : 'Pod Logs'}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-500">{selectedPod.namespace}/{selectedPod.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" icon={RefreshCw} onClick={refreshPodPanel} disabled={!podPanel || panelLoading}>
                  Refresh
                </Button>
                <Button size="icon" variant="ghost" icon={X} onClick={closePodPanel} aria-label="Close pod diagnostics" />
              </div>
            </div>
            <div className="custom-scrollbar flex-1 overflow-auto p-5">
              {panelError ? (
                <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                  {panelError}
                </div>
              ) : null}
              {panelLoading ? (
                <div className="flex min-h-40 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 text-sm text-cyan-100">
                  <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
                  Loading {podPanel?.type === 'events' ? 'events' : 'logs'}
                </div>
              ) : null}
              {!panelLoading && podPanel?.data?.status === 'error' ? (
                <div className="mb-3 rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {podPanel.data.message || 'Kubernetes returned an error for this pod.'}
                </div>
              ) : null}
              {!panelLoading && podPanel?.type === 'logs' ? (
                <pre className="custom-scrollbar min-h-[60vh] overflow-auto rounded-lg border border-slate-800 bg-slate-900/80 p-4 text-xs leading-6 text-slate-300">
                  {(podPanel.data?.logs || ['No logs available.']).join('\n')}
                </pre>
              ) : null}
              {!panelLoading && podPanel?.type === 'events' ? (
                <div className="custom-scrollbar overflow-auto rounded-lg border border-slate-800">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900/90 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">Count</th>
                        <th className="px-4 py-3">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                      {(podPanel.data?.events || []).length ? podPanel.data.events.map((event, index) => (
                        <tr key={`${event.reason || 'event'}-${index}`} className="align-top">
                          <td className="px-4 py-3 text-slate-300">{event.type || 'Normal'}</td>
                          <td className="px-4 py-3 text-slate-100">{event.reason || 'Event'}</td>
                          <td className="px-4 py-3 text-slate-300">{event.count || 1}</td>
                          <td className="whitespace-normal px-4 py-3 text-slate-400">{event.message || 'No message available.'}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No events available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
