import { api } from '../services/api'

export const PROJECT_TYPES = [
  'Docker',
  'Kubernetes',
  'CI/CD',
  'Terraform',
  'AWS Deployment',
  'Monitoring',
  'Self-Healing DevOps',
]

export const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced']

const TOOLS_BY_TYPE = {
  Docker: ['Docker', 'Docker Compose', 'Makefile'],
  Kubernetes: ['Docker', 'Kubernetes', 'kubectl', 'NGINX Ingress'],
  'CI/CD': ['GitHub Actions', 'GHCR', 'Trivy'],
  Terraform: ['Terraform', 'AWS provider', 'remote state placeholder'],
  'AWS Deployment': ['AWS EC2', 'Security Groups', 'IAM', 'K3s'],
  Monitoring: ['Prometheus-ready metrics', 'Grafana-ready dashboard', 'Alert rules'],
  'Self-Healing DevOps': ['Kubernetes probes', 'HPA', 'rollback workflow', 'incident rules'],
}

const TEMPLATE_FEATURES = {
  Docker: [
    'Containerized application runtime with a Dockerfile and compose workflow',
    'Local development stack with service ports and environment placeholders',
    'Repeatable build and run steps for validating the app before deployment',
  ],
  Kubernetes: [
    'Kubernetes deployment, service, and ingress manifests',
    'Container image placeholders ready for GitHub Container Registry',
    'Cluster deployment steps with namespace and runtime configuration guidance',
  ],
  'CI/CD': [
    'GitHub Actions workflow for validation and deployment automation',
    'Build, scan, package, and release stages with secure secret placeholders',
    'Repository-ready automation for pushing generated artifacts forward',
  ],
  Terraform: [
    'Terraform infrastructure files with provider and variable placeholders',
    'Environment-specific provisioning plan for cloud resources',
    'State and secret handling notes for safe infrastructure changes',
  ],
  'AWS Deployment': [
    'AWS compute, networking, IAM, and security group placeholders',
    'Deployment plan for moving an app onto AWS-managed infrastructure',
    'Operational checklist for credentials, access, rollout, and rollback',
  ],
  Monitoring: [
    'Monitoring-ready service plan with metrics, dashboards, and alerting notes',
    'Prometheus and Grafana-oriented operational workflow',
    'Incident visibility steps for validating runtime health',
  ],
  'Self-Healing DevOps': [
    'Health checks, rollback flow, and incident response automation notes',
    'Kubernetes autoscaling and recovery-oriented deployment files',
    'Controlled self-healing workflow with approval and execution steps',
  ],
}

const PROJECTS_KEY = 'opsforge_generated_projects'
const GUEST_COUNT_KEY = 'opsforge_guest_generation_count'
const GUEST_ID_KEY = 'opsforge_guest_id'

function createLocalId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  const randomPart = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(36)).join('')
    : Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${randomPart}`
}

function slugify(value, fallback = 'generated-project') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || fallback
}

export function getGuestId() {
  let guestId = localStorage.getItem(GUEST_ID_KEY)
  if (!guestId) {
    guestId = createLocalId()
    localStorage.setItem(GUEST_ID_KEY, guestId)
  }
  return guestId
}

export function getGuestCount() {
  return Number(localStorage.getItem(GUEST_COUNT_KEY) || 0)
}

export function incrementGuestCount() {
  const next = getGuestCount() + 1
  localStorage.setItem(GUEST_COUNT_KEY, String(next))
  return next
}

export function guestLimitReached() {
  return getGuestCount() >= 3
}

export function getProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveProject(project) {
  const projects = getProjects()
  const existingIndex = projects.findIndex((item) => item.id === project.id)
  if (existingIndex >= 0) {
    projects[existingIndex] = project
  } else {
    projects.unshift(project)
  }
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  return project
}

export function deleteProject(projectId) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(getProjects().filter((project) => project.id !== projectId)))
}

export function projectsForUser(user) {
  return getProjects().filter((project) => {
    if (!user) return project.owner === 'guest'
    return project.owner === user.email
  })
}

function inferTitle(description, projectType) {
  const text = description.trim()
  const explicitName = text.match(/(?:called|named)\s+["']?([a-z0-9][a-z0-9\s-]{2,40})["']?/i)?.[1]
  if (explicitName) {
    return explicitName
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }
  const appMatch = text.match(/(?:build|create|generate|make)\s+(?:an?\s+)?([^,.]{8,55})/i)?.[1]
  if (appMatch) {
    return appMatch
      .replace(/\b(with|using|for|that|which)\b.*$/i, '')
      .trim()
      .split(/\s+/)
      .slice(0, 7)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }
  return `${projectType} Project`
}

function inferBlueprint(description, selectedProjectType, selectedDifficulty) {
  const text = description.toLowerCase()
  const has = (...words) => words.some((word) => text.includes(word))
  const projectType = has('terraform', 'ec2', 'aws', 'vpc', 'iam')
    ? 'AWS Deployment'
    : has('monitoring', 'grafana', 'prometheus', 'alerts')
      ? 'Monitoring'
      : has('self healing', 'self-healing', 'auto heal', 'auto-heal', 'rollback')
        ? 'Self-Healing DevOps'
        : has('kubernetes', 'k8s', 'helm', 'ingress')
          ? 'Kubernetes'
          : has('pipeline', 'ci/cd', 'github actions', 'deploy workflow')
            ? 'CI/CD'
            : has('docker', 'compose', 'container')
              ? 'Docker'
              : selectedProjectType

  const difficulty = has('production', 'enterprise', 'multi environment', 'multi-environment', 'advanced', 'scalable')
    ? 'Advanced'
    : has('simple', 'basic', 'starter', 'beginner')
      ? 'Beginner'
      : selectedDifficulty

  const features = [
    has('auth', 'login', 'user') && 'User authentication and account-aware project workflows',
    has('api', 'backend', 'fastapi', 'node', 'django') && 'Backend API service with environment-based configuration',
    has('frontend', 'react', 'dashboard', 'ui') && 'Frontend application shell ready for deployment',
    has('postgres', 'database', 'sql') && 'PostgreSQL database configuration with secure placeholders',
    has('redis', 'cache', 'queue') && 'Redis cache or queue service wiring',
    has('docker', 'container', 'compose') && 'Containerized local runtime with Docker files',
    has('kubernetes', 'k8s', 'helm', 'ingress') && 'Kubernetes manifests and ingress-ready service routing',
    has('monitoring', 'prometheus', 'grafana', 'metrics') && 'Monitoring-ready configuration and operational checks',
    has('security', 'trivy', 'scan', 'secrets') && 'Security scanning and secret placeholder handling',
    has('github', 'ci', 'cd', 'pipeline', 'workflow') && 'GitHub Actions workflow for validation and release automation',
    has('aws', 'terraform', 'ec2', 'vpc', 'iam') && 'AWS infrastructure placeholders for Terraform-based provisioning',
    has('self healing', 'self-healing', 'auto heal', 'auto-heal', 'rollback') && 'Self-healing hooks, rollback flow, and incident response notes',
  ].filter(Boolean)

  if (!features.length) {
    features.push(
      'Application runtime scaffold based on the project description',
      'Deployment-ready DevOps files with secure placeholder values',
      'Step-by-step implementation plan from local development to release',
    )
  }

  const tools = [
    has('react', 'frontend', 'dashboard') && 'React',
    has('fastapi', 'api', 'backend') && 'FastAPI',
    has('postgres', 'database', 'sql') && 'PostgreSQL',
    has('redis', 'cache', 'queue') && 'Redis',
    (projectType === 'Docker' || has('docker', 'container', 'compose')) && 'Docker',
    (projectType === 'Kubernetes' || has('kubernetes', 'k8s')) && 'Kubernetes',
    has('helm') && 'Helm',
    (projectType === 'CI/CD' || has('github', 'pipeline', 'ci/cd')) && 'GitHub Actions',
    (projectType === 'AWS Deployment' || has('aws', 'terraform')) && 'Terraform',
    has('monitoring', 'prometheus') && 'Prometheus',
    has('grafana') && 'Grafana',
    has('security', 'trivy', 'scan') && 'Trivy',
  ].filter(Boolean)

  return {
    title: inferTitle(description, projectType),
    projectType,
    difficulty,
    features,
    tools: Array.from(new Set(tools.length ? tools : ['Docker', 'GitHub Actions', 'README'])),
  }
}

function templateBlueprint(projectType, difficulty, description) {
  return {
    title: `${difficulty} ${projectType} Project`,
    projectType,
    difficulty,
    features: TEMPLATE_FEATURES[projectType] || TEMPLATE_FEATURES.Kubernetes,
    tools: TOOLS_BY_TYPE[projectType] || ['Docker', 'GitHub Actions', 'README'],
    source: 'template',
    description: description.trim(),
  }
}

function fileSet(projectType, title, description, features) {
  const slug = slugify(title)
  const base = {
    'README.md': `# ${title}\n\nGenerated by OpsForge from this project description:\n\n> ${description || 'No description provided.'}\n\n## What this project does\n\n${features.map((feature) => `- ${feature}`).join('\n')}\n\n## Goal\nCreate a production-style ${projectType} project with secure defaults, implementation steps, and deployable DevOps files.\n`,
    'docs/implementation-plan.md': `# Implementation Plan\n\n${features.map((feature, index) => `${index + 1}. ${feature}`).join('\n')}\n\n## Release Path\n\n1. Review generated files.\n2. Configure secrets and environment values.\n3. Run local validation.\n4. Push to GitHub.\n5. Deploy through the selected runtime target.\n`,
  }

  const files = { ...base }
  if (['Docker', 'Kubernetes', 'Self-Healing DevOps'].includes(projectType)) {
    files.Dockerfile = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nCMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]\n'
    files['docker-compose.yml'] = 'services:\n  app:\n    build: .\n    ports:\n      - "8000:8000"\n  redis:\n    image: redis:7-alpine\n'
  }
  if (['Kubernetes', 'Monitoring', 'Self-Healing DevOps'].includes(projectType)) {
    files['deployment.yaml'] = `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${slug}\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: ${slug}\n  template:\n    metadata:\n      labels:\n        app: ${slug}\n    spec:\n      containers:\n        - name: app\n          image: ghcr.io/BIRAJ49/${slug}:latest\n`
    files['service.yaml'] = `apiVersion: v1\nkind: Service\nmetadata:\n  name: ${slug}\nspec:\n  selector:\n    app: ${slug}\n  ports:\n    - port: 80\n      targetPort: 8000\n`
    files['ingress.yaml'] = `apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: ${slug}\nspec:\n  ingressClassName: nginx\n`
  }
  if (['Terraform', 'AWS Deployment'].includes(projectType)) {
    files['main.tf'] = 'resource "aws_instance" "app" {\n  ami           = var.ami_id\n  instance_type = var.instance_type\n  subnet_id     = var.subnet_id\n}\n'
    files['variables.tf'] = 'variable "ami_id" { default = "replace-with-ami-id" }\nvariable "instance_type" { default = "replace-with-instance-type" }\nvariable "subnet_id" { default = "replace-with-subnet-id" }\n'
  }
  if (['CI/CD', 'Kubernetes', 'Self-Healing DevOps'].includes(projectType)) {
    files['.github/workflows/deploy.yml'] = 'name: Deploy\non:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "Build, scan, push, update GitOps"\n'
  }
  return files
}

export function generateProject({ projectType, difficulty, requirement, user, generationMode = 'ai' }) {
  const blueprint = generationMode === 'template'
    ? templateBlueprint(projectType, difficulty, requirement)
    : inferBlueprint(requirement, projectType, difficulty)
  const title = blueprint.title
  const files = fileSet(blueprint.projectType, title, requirement, blueprint.features)
  const sourceLabel = generationMode === 'template' ? 'used the selected template' : 'analyzed the description'
  const architecture = generationMode === 'template'
    ? `The architecture follows the ${blueprint.projectType} template. It includes the standard files, tools, implementation sequence, and secure placeholders expected for this template.`
    : 'The architecture is derived from the requested features. It separates application runtime, configuration, infrastructure manifests, CI/CD automation, and operational documentation so the project can move from local validation to deployment.'

  return {
    id: createLocalId(),
    owner: user?.email || 'guest',
    title,
    projectType: blueprint.projectType,
    difficulty: blueprint.difficulty,
    generationMode,
    requirement: requirement || `Generated from the ${blueprint.projectType} template.`,
    overview: `OpsForge ${sourceLabel} and generated a ${blueprint.difficulty.toLowerCase()} ${blueprint.projectType} workspace with features, implementation steps, secure placeholders, and download-ready files.`,
    architecture,
    features: blueprint.features,
    tools: blueprint.tools.length ? blueprint.tools : TOOLS_BY_TYPE[blueprint.projectType] || ['Docker', 'GitHub Actions'],
    steps: [
      generationMode === 'template'
        ? `Start from the ${blueprint.projectType} template and review the included assumptions.`
        : 'Translate the project description into concrete application features and runtime dependencies.',
      'Create the repository structure, documentation, and environment placeholders.',
      `Generate application, container, infrastructure, and automation files for ${generationMode === 'template' ? 'the selected template' : 'the inferred target'}.`,
      'Add validation, security scanning, deployment, and operational review steps.',
      'Run locally, configure secrets, push to GitHub, and deploy through the generated workflow.',
    ],
    folderStructure: ['app/', 'infra/', 'k8s/', '.github/workflows/', 'README.md'],
    files,
    downloads: { zip: 0, pdf: 0 },
    createdAt: new Date().toISOString(),
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

async function downloadBackendProject(project, format) {
  const backendProjectId = project.backendProjectId || project.backendId
  if (!backendProjectId) return false
  const response = await api.get(`/projects/${backendProjectId}/download/${format}`, { responseType: 'blob' })
  downloadBlob(response.data, `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`)
  return true
}

export async function downloadProject(project, format) {
  try {
    if (await downloadBackendProject(project, format)) {
      const updated = { ...project, downloads: { ...project.downloads, [format]: (project.downloads?.[format] || 0) + 1 } }
      saveProject(updated)
      return updated
    }
  } catch {
    // Fall back to the local project export if the backend is unavailable.
  }
  const body = [
    project.title,
    '',
    project.overview,
    '',
    'Architecture:',
    project.architecture,
    '',
    'Features:',
    ...(project.features || []).map((feature) => `- ${feature}`),
    '',
    'Tools:',
    ...project.tools.map((tool) => `- ${tool}`),
    '',
    'Steps:',
    ...project.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    ...Object.entries(project.files).flatMap(([fileName, content]) => [`--- ${fileName} ---`, content, '']),
  ].join('\n')
  const blob = new Blob([body], { type: format === 'pdf' ? 'application/pdf' : 'application/zip' })
  downloadBlob(blob, `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`)
  const updated = { ...project, downloads: { ...project.downloads, [format]: (project.downloads?.[format] || 0) + 1 } }
  saveProject(updated)
  return updated
}
