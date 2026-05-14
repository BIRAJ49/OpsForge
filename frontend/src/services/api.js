import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('opsforge_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  window.dispatchEvent(new CustomEvent('opsforge:api-start'))
  return config
})

api.interceptors.response.use(
  (response) => {
    window.dispatchEvent(new CustomEvent('opsforge:api-end'))
    return response
  },
  (error) => {
    window.dispatchEvent(new CustomEvent('opsforge:api-end'))
    return Promise.reject(error)
  },
)

export function unwrap(response) {
  return response.data?.data ?? response.data
}

export function apiErrorMessage(error, fallback = 'Request failed') {
  return error.response?.data?.message || error.response?.data?.detail || error.message || fallback
}

export const projectAnalyzerApi = {
  uploadProject(formData) {
    return api.post('/projects/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  importGithubProject(payload) {
    return api.post('/projects/import-from-github', payload)
  },
  getUploadStatus(projectId) {
    return api.get(`/projects/${projectId}/upload-status`)
  },
  analyzeProject(projectId) {
    return api.post(`/projects/${projectId}/analyze`)
  },
  getProjectAnalysis(projectId) {
    return api.get(`/projects/${projectId}/analysis`)
  },
  updateProjectProfile(projectId, projectProfile) {
    return api.put(`/projects/${projectId}/analysis/profile`, { project_profile: projectProfile })
  },
  getAnalysisFiles(projectId) {
    return api.get(`/projects/${projectId}/analysis/files`)
  },
  generateFromAnalysis(projectId, payload = {}) {
    return api.post(`/projects/${projectId}/generate-from-analysis`, payload)
  },
  regenerateFile(projectId, filePath) {
    return api.post(`/projects/${projectId}/regenerate-file`, { file_path: filePath })
  },
  getGeneratedFiles(projectId) {
    return api.get(`/projects/${projectId}/generated-files`)
  },
}
