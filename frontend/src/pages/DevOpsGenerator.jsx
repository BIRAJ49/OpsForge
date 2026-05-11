import { Link } from 'react-router-dom'
import { FileCode2, UploadCloud } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader } from '../components/ui/Card'

export default function DevOpsGenerator() {
  const lastProjectId = localStorage.getItem('opsforge_last_project_id')
  return (
    <Card>
      <CardHeader title="DevOps Generator" description="Generate lifecycle files from a completed project analysis." />
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <Link to="/app/upload-project" className="rounded-lg border border-slate-800 bg-slate-950/60 p-5 transition hover:border-cyan-400/40">
            <UploadCloud className="h-6 w-6 text-cyan-300" />
            <p className="mt-4 font-semibold text-white">Analyze a project</p>
            <p className="mt-2 text-sm text-slate-400">Upload a ZIP or connect a GitHub repository before generating DevOps files.</p>
          </Link>
          <Link to={lastProjectId ? `/app/projects/${lastProjectId}/analysis` : '/app/project-analysis'} className="rounded-lg border border-slate-800 bg-slate-950/60 p-5 transition hover:border-cyan-400/40">
            <FileCode2 className="h-6 w-6 text-cyan-300" />
            <p className="mt-4 font-semibold text-white">Generate from latest analysis</p>
            <p className="mt-2 text-sm text-slate-400">Review detection results, then create Docker, CI/CD, Kubernetes, Helm, Argo CD, Terraform, and docs.</p>
          </Link>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Link to="/app/upload-project"><Button variant="secondary" icon={UploadCloud}>Upload Project</Button></Link>
          <Link to={lastProjectId ? `/app/projects/${lastProjectId}/analysis` : '/app/project-analysis'}><Button icon={FileCode2}>Open Analysis</Button></Link>
        </div>
      </CardContent>
    </Card>
  )
}
