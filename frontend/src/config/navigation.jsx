import {
  Activity,
  Bot,
  Boxes,
  ClipboardList,
  CloudCog,
  FilePlus2,
  FolderSearch,
  GitBranch,
  LayoutDashboard,
  ListTree,
  Lock,
  Rocket,
  Settings,
  ShieldAlert,
  TerminalSquare,
  Users,
  Wrench,
} from 'lucide-react'

export const roleRank = {
  USER: 1,
  ADMIN: 2,
}

export const canAccess = (role, minRole = 'USER') => (roleRank[role] || 0) >= roleRank[minRole]

export const userNavItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, minRole: 'USER' },
  { name: 'Generate', path: '/generate', icon: FilePlus2, minRole: 'USER' },
  { name: 'Overview', path: '/app/overview', icon: LayoutDashboard, minRole: 'USER' },
  { name: 'Projects', path: '/app/projects', icon: Boxes, minRole: 'USER' },
  { name: 'Analyze App', path: '/app/project-analysis', icon: FolderSearch, minRole: 'USER' },
  { name: 'Generated Files', path: '/app/generated-files', icon: ClipboardList, minRole: 'USER' },
  { name: 'Deployments', path: '/app/deployments', icon: Rocket, minRole: 'USER' },
  { name: 'GitOps', path: '/app/gitops', icon: GitBranch, minRole: 'USER' },
  { name: 'Kubernetes', path: '/app/kubernetes', icon: CloudCog, minRole: 'USER' },
  { name: 'Monitoring', path: '/app/monitoring', icon: Activity, minRole: 'USER' },
  { name: 'Logs', path: '/app/logs', icon: TerminalSquare, minRole: 'USER' },
  { name: 'Incidents', path: '/app/incidents', icon: ShieldAlert, minRole: 'USER' },
  { name: 'Healing Actions', path: '/app/healing-actions', icon: Wrench, minRole: 'USER' },
  { name: 'AI Assistant', path: '/app/ai-assistant', icon: Bot, minRole: 'USER' },
  { name: 'Security', path: '/app/security', icon: Lock, minRole: 'USER' },
  { name: 'Infrastructure', path: '/app/infrastructure', icon: ListTree, minRole: 'USER' },
  { name: 'Settings', path: '/app/settings', icon: Settings, minRole: 'USER' },
]

export const adminNavItems = [
  { name: 'Admin Overview', path: '/admin/dashboard', icon: LayoutDashboard, minRole: 'ADMIN' },
  { name: 'Users', path: '/admin/user-management', icon: Users, minRole: 'ADMIN' },
  { name: 'All Projects', path: '/admin/generated-projects', icon: Boxes, minRole: 'ADMIN' },
  { name: 'System Usage', path: '/admin/system-usage', icon: Activity, minRole: 'ADMIN' },
  { name: 'Audit Logs', path: '/admin/audit-logs', icon: ClipboardList, minRole: 'ADMIN' },
]
