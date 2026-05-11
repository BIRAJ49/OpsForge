import { Bot, PlayCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'

const leftPanels = [
  ['Incident details', 'billing-api is returning HTTP 500 for 18% of payment authorization requests after deployment v2.4.0.'],
  ['Pod logs', 'ERROR pool exhausted: active=60 idle=0 waiting=142 timeout=30s'],
  ['Kubernetes events', 'Readiness probe failed 9 times for billing-api-6dcff68674-l9qts.'],
  ['Prometheus alert', 'HighPaymentFailureRate firing for service=billing-api severity=critical.'],
]

export default function AIAssistant() {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader title="Incident Context" description="Runtime evidence passed to the AI incident assistant." />
        <CardContent className="space-y-4">
          {leftPanels.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              <p className="mt-2 font-mono text-sm leading-6 text-slate-400">{body}</p>
            </div>
          ))}
          <Button icon={PlayCircle} className="w-full">Analyze Incident</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="AI Analysis Result" description="Root cause and recommended remediation plan." action={<Bot className="h-5 w-5 text-cyan-300" />} />
        <CardContent className="space-y-4">
          {[
            ['Root cause', 'The v2.4.0 rollout increased synchronous database calls without increasing the connection pool or enabling backpressure. Pods remain alive but fail readiness under load.'],
            ['Suggested fix', 'Rollback to v2.3.9 or increase max pool size while reducing worker concurrency. Add circuit breaking around payment authorization retries.'],
            ['Recommended kubectl command', 'kubectl rollout undo deployment/billing-api -n prod'],
            ['Prevention advice', 'Add load-test gates before promotion, alert on connection pool waiters, and set HPA on queue depth plus CPU.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
                {title === 'Root cause' ? <StatusBadge status="Critical" /> : null}
              </div>
              <p className={`mt-2 text-sm leading-6 ${title.includes('command') ? 'font-mono text-cyan-200' : 'text-slate-400'}`}>{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
