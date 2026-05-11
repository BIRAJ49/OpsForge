import { Badge } from './Badge'

const statusTone = {
  Healthy: 'green',
  Synced: 'green',
  Running: 'green',
  Resolved: 'green',
  Active: 'green',
  Passed: 'green',
  Progressing: 'blue',
  Investigating: 'amber',
  Pending: 'amber',
  Warning: 'amber',
  OutOfSync: 'amber',
  Open: 'rose',
  Failed: 'rose',
  Critical: 'rose',
  High: 'rose',
  Medium: 'amber',
  Low: 'blue',
}

export function StatusBadge({ status }) {
  return <Badge tone={statusTone[status] || 'slate'}>{status}</Badge>
}
