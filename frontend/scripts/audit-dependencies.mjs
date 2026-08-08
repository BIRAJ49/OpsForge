import { spawnSync } from 'node:child_process'

const waivers = new Map([
  [
    'GHSA-qwww-vcr4-c8h2',
    {
      expires: '2026-10-31',
      reason: 'OpsForge is a client-only SPA and does not use React Router RSC actions; no patched v7 release is available.',
    },
  ],
])

const audit = spawnSync('npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], {
  encoding: 'utf8',
})

if (audit.error) throw audit.error

let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  process.stderr.write(audit.stderr || audit.stdout || 'npm audit returned invalid JSON\n')
  process.exit(1)
}

const vulnerabilities = report.vulnerabilities ?? {}

function advisoriesFor(packageName, visited = new Set()) {
  if (visited.has(packageName)) return []
  visited.add(packageName)

  return (vulnerabilities[packageName]?.via ?? []).flatMap((item) =>
    typeof item === 'string' ? advisoriesFor(item, visited) : [item],
  )
}

const uniqueAdvisories = new Map()
for (const packageName of Object.keys(vulnerabilities)) {
  for (const advisory of advisoriesFor(packageName)) {
    const id = advisory.url?.split('/').at(-1) ?? `${advisory.source}`
    uniqueAdvisories.set(id, advisory)
  }
}

const today = new Date().toISOString().slice(0, 10)
const blocked = []
const gatedSeverities = new Set(['high', 'critical'])

for (const [id, advisory] of uniqueAdvisories) {
  if (!gatedSeverities.has(advisory.severity)) continue
  const waiver = waivers.get(id)
  if (waiver && today <= waiver.expires) {
    console.warn(`WAIVED ${id} until ${waiver.expires}: ${waiver.reason}`)
    continue
  }
  blocked.push({ id, advisory, waiver })
}

if (blocked.length > 0) {
  for (const { id, advisory, waiver } of blocked) {
    const prefix = waiver ? `EXPIRED ${id}` : `BLOCKED ${id}`
    console.error(`${prefix}: ${advisory.title} (${advisory.severity})`)
  }
  process.exit(1)
}

if (audit.status !== 0 && uniqueAdvisories.size === 0) {
  process.stderr.write(audit.stderr || 'npm audit failed without structured advisories\n')
  process.exit(1)
}

console.log('No unwaived high or critical production dependency vulnerabilities found.')
