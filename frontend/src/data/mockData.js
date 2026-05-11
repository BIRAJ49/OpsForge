export const summaryCards = [
  { label: 'Total Projects', value: '42', delta: '+6 this month', tone: 'cyan' },
  { label: 'Healthy Deployments', value: '128', delta: '96.4% success', tone: 'green' },
  { label: 'Failed Deployments', value: '5', delta: '-2 vs last week', tone: 'rose' },
  { label: 'Active Alerts', value: '12', delta: '3 critical', tone: 'amber' },
  { label: 'Security Issues', value: '31', delta: '8 high', tone: 'purple' },
  { label: 'Average CPU Usage', value: '63%', delta: '+4.2%', tone: 'blue' },
  { label: 'Average Memory Usage', value: '71%', delta: '+1.8%', tone: 'cyan' },
  { label: 'Last Deployment Time', value: '18m', delta: 'payments-api', tone: 'slate' },
]

export const deploymentSuccessData = [
  { day: 'Mon', success: 94, failed: 6 },
  { day: 'Tue', success: 97, failed: 3 },
  { day: 'Wed', success: 91, failed: 9 },
  { day: 'Thu', success: 96, failed: 4 },
  { day: 'Fri', success: 98, failed: 2 },
  { day: 'Sat', success: 93, failed: 7 },
  { day: 'Sun', success: 99, failed: 1 },
]

export const resourceUsageData = [
  { time: '00:00', cpu: 42, memory: 58, requests: 320, errors: 1.2, latency: 96, restarts: 0 },
  { time: '04:00', cpu: 48, memory: 61, requests: 380, errors: 1.8, latency: 112, restarts: 1 },
  { time: '08:00', cpu: 66, memory: 70, requests: 690, errors: 2.5, latency: 135, restarts: 2 },
  { time: '12:00', cpu: 72, memory: 76, requests: 820, errors: 3.2, latency: 148, restarts: 1 },
  { time: '16:00', cpu: 61, memory: 72, requests: 740, errors: 2.1, latency: 121, restarts: 0 },
  { time: '20:00', cpu: 55, memory: 67, requests: 560, errors: 1.7, latency: 104, restarts: 1 },
]

export const incidentTrendData = [
  { week: 'W1', low: 4, medium: 3, high: 1 },
  { week: 'W2', low: 3, medium: 4, high: 2 },
  { week: 'W3', low: 5, medium: 2, high: 1 },
  { week: 'W4', low: 2, medium: 3, high: 3 },
  { week: 'W5', low: 4, medium: 1, high: 1 },
]

export const serviceHealth = [
  { name: 'api-gateway', value: 98 },
  { name: 'payments-api', value: 82 },
  { name: 'worker-queue', value: 91 },
  { name: 'web-console', value: 99 },
]

export const projects = [
  {
    name: 'checkout-service',
    owner: 'Biraj Ops',
    team: 'Payments',
    stack: 'Node.js, PostgreSQL, Redis',
    environment: 'Prod',
    deploymentType: 'GitOps',
    status: 'Healthy',
    updated: '8 min ago',
  },
  {
    name: 'opsforge-console',
    owner: 'Biraj Ops',
    team: 'Platform',
    stack: 'React, FastAPI',
    environment: 'Staging',
    deploymentType: 'Helm',
    status: 'Progressing',
    updated: '24 min ago',
  },
  {
    name: 'analytics-worker',
    owner: 'Biraj Ops',
    team: 'Data',
    stack: 'FastAPI, Redis',
    environment: 'Prod',
    deploymentType: 'Kubernetes',
    status: 'Healthy',
    updated: '1 hr ago',
  },
  {
    name: 'billing-api',
    owner: 'Biraj Ops',
    team: 'Payments',
    stack: 'Node.js, PostgreSQL',
    environment: 'Prod',
    deploymentType: 'Docker',
    status: 'Failed',
    updated: '2 hr ago',
  },
]

export const allProjects = [
  ...projects,
  {
    name: 'identity-service',
    owner: 'Mira Shah',
    team: 'Core Platform',
    stack: 'FastAPI, PostgreSQL',
    environment: 'Prod',
    deploymentType: 'GitOps',
    status: 'Healthy',
    updated: '14 min ago',
  },
  {
    name: 'reporting-ui',
    owner: 'Nabin KC',
    team: 'Analytics',
    stack: 'React, Node.js',
    environment: 'Staging',
    deploymentType: 'Helm',
    status: 'Progressing',
    updated: '38 min ago',
  },
]

export const generatedFiles = [
  ['Dockerfile', 'Container'],
  ['docker-compose.yml', 'Compose'],
  ['Kubernetes deployment.yaml', 'Kubernetes'],
  ['service.yaml', 'Kubernetes'],
  ['ingress.yaml', 'Kubernetes'],
  ['configmap.yaml', 'Kubernetes'],
  ['secret.yaml', 'Kubernetes'],
  ['hpa.yaml', 'Autoscaling'],
  ['Helm values.yaml', 'Helm'],
  ['GitHub Actions workflow', 'CI/CD'],
  ['Argo CD application.yaml', 'GitOps'],
  ['Terraform template', 'IaC'],
  ['README.md', 'Docs'],
].map(([name, type]) => ({ name, type }))

export const deployments = [
  {
    name: 'checkout-service',
    image: 'registry.opsforge.dev/checkout:v1.18.2',
    environment: 'Prod',
    status: 'Healthy',
    replicas: '8/8',
    lastDeployment: '18 min ago',
  },
  {
    name: 'billing-api',
    image: 'registry.opsforge.dev/billing:v2.4.0',
    environment: 'Prod',
    status: 'Failed',
    replicas: '2/6',
    lastDeployment: '46 min ago',
  },
  {
    name: 'web-console',
    image: 'registry.opsforge.dev/console:v0.31.5',
    environment: 'Staging',
    status: 'Progressing',
    replicas: '3/4',
    lastDeployment: '9 min ago',
  },
]

export const allDeployments = [
  ...deployments,
  {
    name: 'identity-service',
    image: 'registry.opsforge.dev/identity:v3.7.1',
    environment: 'Prod',
    status: 'Healthy',
    replicas: '10/10',
    lastDeployment: '14 min ago',
  },
  {
    name: 'reporting-ui',
    image: 'registry.opsforge.dev/reporting:v0.9.8',
    environment: 'Staging',
    status: 'Progressing',
    replicas: '2/3',
    lastDeployment: '38 min ago',
  },
]

export const timeline = [
  { time: '13:02', title: 'Image built', detail: 'checkout:v1.18.2 pushed to registry' },
  { time: '13:07', title: 'GitOps commit merged', detail: 'Updated Helm values in env/prod' },
  { time: '13:10', title: 'Argo CD synced', detail: 'Deployment reached desired state' },
  { time: '13:18', title: 'Smoke tests passed', detail: 'All synthetic checks green' },
]

export const gitopsHistory = [
  { commit: '9f42c18', author: 'sre-bot', status: 'Synced', time: '18 min ago' },
  { commit: '5a6e90b', author: 'mira', status: 'Synced', time: '3 hr ago' },
  { commit: 'c012aaf', author: 'devops-ai', status: 'OutOfSync', time: 'Yesterday' },
]

export const pods = [
  {
    name: 'checkout-service-7988cb7f7d-mn2s4',
    namespace: 'prod',
    status: 'Running',
    restarts: 0,
    cpu: '180m',
    memory: '412Mi',
    age: '3h',
  },
  {
    name: 'billing-api-6dcff68674-l9qts',
    namespace: 'prod',
    status: 'Failed',
    restarts: 7,
    cpu: '720m',
    memory: '1.2Gi',
    age: '42m',
  },
  {
    name: 'worker-queue-5854f5fb6d-2p9b6',
    namespace: 'prod',
    status: 'Running',
    restarts: 1,
    cpu: '260m',
    memory: '684Mi',
    age: '1d',
  },
]

export const k8sResources = [
  { label: 'Pods', value: 64, status: '3 unhealthy' },
  { label: 'Deployments', value: 22, status: '1 progressing' },
  { label: 'Services', value: 31, status: 'stable' },
  { label: 'Ingress', value: 8, status: '2 pending certs' },
  { label: 'ConfigMaps', value: 47, status: 'versioned' },
  { label: 'Secrets', value: 19, status: 'rotating' },
  { label: 'HPA', value: 14, status: 'scaling ready' },
]

export const logs = [
  {
    timestamp: '2026-05-06T13:19:21+05:45',
    service: 'billing-api',
    severity: 'Error',
    message: 'Database connection pool exhausted after 30s timeout',
  },
  {
    timestamp: '2026-05-06T13:19:18+05:45',
    service: 'checkout-service',
    severity: 'Info',
    message: 'Order workflow completed in 238ms request_id=ord_81f9',
  },
  {
    timestamp: '2026-05-06T13:18:42+05:45',
    service: 'api-gateway',
    severity: 'Warning',
    message: 'Elevated p95 latency detected for /v1/payments',
  },
  {
    timestamp: '2026-05-06T13:18:10+05:45',
    service: 'worker-queue',
    severity: 'Critical',
    message: 'Dead letter queue above threshold: 1,420 events pending',
  },
]

export const incidents = [
  {
    title: 'Payment authorization failures',
    severity: 'Critical',
    service: 'billing-api',
    status: 'Investigating',
    rootCause: 'Connection pool saturation after latest rollout increased DB concurrency.',
    created: '32 min ago',
  },
  {
    title: 'Worker queue lag increasing',
    severity: 'High',
    service: 'worker-queue',
    status: 'Open',
    rootCause: 'Redis CPU throttling causing delayed message acknowledgement.',
    created: '1 hr ago',
  },
  {
    title: 'Ingress certificate renewal delay',
    severity: 'Medium',
    service: 'api-gateway',
    status: 'Resolved',
    rootCause: 'ACME challenge retried successfully after DNS propagation.',
    created: '4 hr ago',
  },
]

export const securityIssues = [
  {
    issue: 'CVE-2026-1142 in openssl',
    severity: 'High',
    resource: 'checkout-service image',
    recommendation: 'Rebuild image with patched base layer.',
    status: 'Open',
  },
  {
    issue: 'Privileged container enabled',
    severity: 'Critical',
    resource: 'billing-api deployment',
    recommendation: 'Set privileged=false and add a restricted PSP profile.',
    status: 'Open',
  },
  {
    issue: 'Secret committed in values file',
    severity: 'Medium',
    resource: 'helm/payments/values.yaml',
    recommendation: 'Move value to external secret manager.',
    status: 'Investigating',
  },
]

export const terraformModules = [
  { name: 'network-prod', resource: 'VPC', status: 'Active', cost: '$482/mo' },
  { name: 'eks-platform', resource: 'EKS', status: 'Active', cost: '$1,240/mo' },
  { name: 'data-plane', resource: 'RDS', status: 'Warning', cost: '$920/mo' },
  { name: 'artifact-store', resource: 'S3', status: 'Active', cost: '$184/mo' },
]

export const platformUsers = [
  { name: 'Biraj Ops', email: 'biraj@opsforge.dev', role: 'Platform Admin', team: 'Platform', status: 'Active', lastLogin: '5 min ago' },
  { name: 'Mira Shah', email: 'mira@opsforge.dev', role: 'Team Admin', team: 'Core Platform', status: 'Active', lastLogin: '22 min ago' },
  { name: 'Nabin KC', email: 'nabin@opsforge.dev', role: 'DevOps Engineer', team: 'Analytics', status: 'Active', lastLogin: '1 hr ago' },
  { name: 'Asha Rai', email: 'asha@opsforge.dev', role: 'User', team: 'Payments', status: 'Pending', lastLogin: 'Yesterday' },
]

export const rolePermissions = [
  { role: 'User', scope: 'Own projects', permissions: 'Create projects, generate files, view own logs and metrics, request actions' },
  { role: 'DevOps Engineer', scope: 'Team workloads', permissions: 'GitOps, Kubernetes, deployment actions, incident operations' },
  { role: 'Team Admin', scope: 'Team administration', permissions: 'Team infrastructure, project governance, security scan management' },
  { role: 'Platform Admin', scope: 'Platform-wide', permissions: 'Users, roles, clusters, policies, integrations, AI providers, audit logs' },
]

export const clusters = [
  { name: 'prod-us-east-1', provider: 'AWS EKS', version: '1.30', nodes: 42, status: 'Healthy', cost: '$8,420/mo' },
  { name: 'staging-us-east-1', provider: 'AWS EKS', version: '1.30', nodes: 14, status: 'Healthy', cost: '$2,120/mo' },
  { name: 'dev-local', provider: 'Kubernetes', version: '1.29', nodes: 6, status: 'Warning', cost: '$680/mo' },
]

export const integrations = [
  { name: 'GitHub Enterprise', type: 'SCM', status: 'Active', owner: 'Platform', updated: '2 days ago' },
  { name: 'Docker Registry', type: 'Registry', status: 'Active', owner: 'SRE', updated: '5 hr ago' },
  { name: 'PagerDuty', type: 'Incident response', status: 'Active', owner: 'SRE', updated: '1 day ago' },
  { name: 'Slack', type: 'Notifications', status: 'Active', owner: 'Platform', updated: '3 days ago' },
]

export const securityPolicies = [
  { name: 'Block privileged containers', scope: 'All clusters', enforcement: 'Enforce', status: 'Active', violations: 1 },
  { name: 'Require image signatures', scope: 'Prod namespaces', enforcement: 'Enforce', status: 'Active', violations: 3 },
  { name: 'No plaintext secrets', scope: 'GitOps repos', enforcement: 'Warn', status: 'Warning', violations: 4 },
  { name: 'CIS Kubernetes baseline', scope: 'Platform clusters', enforcement: 'Audit', status: 'Active', violations: 12 },
]

export const auditLogs = [
  { time: '2026-05-06 13:24:12', actor: 'biraj@opsforge.dev', action: 'User login', target: 'OpsForge console', result: 'Success', ip: '192.168.1.107' },
  { time: '2026-05-06 13:21:02', actor: 'mira@opsforge.dev', action: 'Project creation', target: 'identity-service', result: 'Success', ip: '10.2.14.8' },
  { time: '2026-05-06 13:18:44', actor: 'nabin@opsforge.dev', action: 'Deployment trigger', target: 'reporting-ui:v0.9.8', result: 'Success', ip: '10.2.16.22' },
  { time: '2026-05-06 13:16:33', actor: 'devops-ai', action: 'Restart deployment', target: 'worker-queue', result: 'Success', ip: 'system' },
  { time: '2026-05-06 13:12:11', actor: 'biraj@opsforge.dev', action: 'Rollback deployment', target: 'billing-api', result: 'Success', ip: '192.168.1.107' },
  { time: '2026-05-06 13:08:59', actor: 'security-bot', action: 'Security scan', target: 'checkout-service image', result: 'Warning', ip: 'system' },
  { time: '2026-05-06 13:05:47', actor: 'mira@opsforge.dev', action: 'AI incident analysis', target: 'payment authorization failures', result: 'Success', ip: '10.2.14.8' },
  { time: '2026-05-06 12:58:15', actor: 'biraj@opsforge.dev', action: 'API key update', target: 'OpenAI provider key', result: 'Success', ip: '192.168.1.107' },
  { time: '2026-05-06 12:44:05', actor: 'biraj@opsforge.dev', action: 'Cluster config update', target: 'prod-us-east-1', result: 'Success', ip: '192.168.1.107' },
  { time: '2026-05-06 12:30:52', actor: 'biraj@opsforge.dev', action: 'User role update', target: 'nabin@opsforge.dev DevOps Engineer', result: 'Success', ip: '192.168.1.107' },
]

export const systemHealth = [
  { service: 'API Gateway', uptime: '99.99%', status: 'Healthy', latency: '42ms' },
  { service: 'Workflow Engine', uptime: '99.94%', status: 'Healthy', latency: '88ms' },
  { service: 'AI Analysis Queue', uptime: '99.8%', status: 'Warning', latency: '320ms' },
  { service: 'GitOps Reconciler', uptime: '99.97%', status: 'Healthy', latency: '65ms' },
]
