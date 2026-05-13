import {
  Activity,
  Bot,
  Boxes,
  ClipboardList,
  CloudCog,
  FolderSearch,
  FileCode2,
  GitBranch,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  ListTree,
  Lock,
  Rocket,
  Settings,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react'

export const roleRank = {
  USER: 1,
  ADMIN: 2,
}

export const canAccess = (role, minRole = 'USER') => (roleRank[role] || 0) >= roleRank[minRole]

export const userNavItems = [
  { name: 'Overview', path: '/app/overview', icon: LayoutDashboard, minRole: 'USER' },
  { name: 'Projects', path: '/app/projects', icon: Boxes, minRole: 'USER' },
  { name: 'Project Analysis', path: '/app/project-analysis', icon: FolderSearch, minRole: 'USER' },
  { name: 'DevOps Generator', path: '/app/devops-generator', icon: FileCode2, minRole: 'USER' },
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
  { name: 'Admin Overview', path: '/admin/overview', icon: LayoutDashboard, minRole: 'ADMIN' },
  { name: 'Users', path: '/admin/users', icon: Users, minRole: 'ADMIN' },
  { name: 'Roles', path: '/admin/roles', icon: UserCog, minRole: 'ADMIN' },
  { name: 'All Projects', path: '/admin/projects', icon: Boxes, minRole: 'ADMIN' },
  { name: 'All Deployments', path: '/admin/deployments', icon: Rocket, minRole: 'ADMIN' },
  { name: 'Clusters', path: '/admin/clusters', icon: CloudCog, minRole: 'ADMIN' },
  { name: 'Incidents', path: '/admin/incidents', icon: ShieldAlert, minRole: 'ADMIN' },
  { name: 'Security Policies', path: '/admin/security-policies', icon: ShieldCheck, minRole: 'ADMIN' },
  { name: 'Integrations', path: '/admin/integrations', icon: KeyRound, minRole: 'ADMIN' },
  { name: 'AI Settings', path: '/admin/ai-settings', icon: Bot, minRole: 'ADMIN' },
  { name: 'Audit Logs', path: '/admin/audit-logs', icon: ClipboardList, minRole: 'ADMIN' },
  { name: 'System Health', path: '/admin/system-health', icon: HeartPulse, minRole: 'ADMIN' },
  { name: 'Settings', path: '/admin/settings', icon: Settings, minRole: 'ADMIN' },
]
