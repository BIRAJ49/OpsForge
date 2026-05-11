import { Bot, Save } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardContent } from '../../components/ui/Card'

export default function AdminAISettings() {
  return (
    <Card className="max-w-5xl">
      <CardHeader title="AI Provider Settings" description="Configure incident analysis providers and platform-wide AI defaults." action={<Button icon={Save}>Save</Button>} />
      <CardContent>
        <div className="grid gap-5 md:grid-cols-2">
          {['Bedrock', 'OpenRouter', 'Gemini', 'OpenAI'].map((provider, index) => (
            <label key={provider} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <span className="flex items-center gap-3 text-sm font-medium text-slate-100">
                <Bot className="h-4 w-4 text-cyan-300" />
                {provider}
              </span>
              <input type="radio" name="provider" defaultChecked={index === 3} className="h-4 w-4 accent-cyan-400" />
            </label>
          ))}
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm text-slate-300">Default incident analysis prompt</span>
            <textarea className="min-h-32 w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-cyan-400" defaultValue="Analyze incident evidence, identify root cause, severity, recommended kubectl action, and prevention steps." />
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
