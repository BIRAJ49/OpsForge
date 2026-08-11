import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteProject,
  generateProject,
  getGuestCount,
  getProjects,
  guestLimitReached,
  incrementGuestCount,
  projectsForUser,
  saveProject,
} from '../src/utils/generator'

function createStorage() {
  const values = new Map()

  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    removeItem: vi.fn((key) => values.delete(key)),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
  }
}

describe('project generation and local persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('infers a production Kubernetes blueprint from a detailed request', () => {
    const project = generateProject({
      projectType: 'Docker',
      difficulty: 'Intermediate',
      requirement: 'Build a production Kubernetes dashboard with React, FastAPI, PostgreSQL, and security scans',
      user: { email: 'owner@example.com' },
    })

    expect(project.owner).toBe('owner@example.com')
    expect(project.projectType).toBe('Kubernetes')
    expect(project.difficulty).toBe('Advanced')
    expect(project.tools).toEqual(expect.arrayContaining(['React', 'FastAPI', 'PostgreSQL', 'Kubernetes', 'Trivy']))
    expect(project.files).toHaveProperty('deployment.yaml')
    expect(project.files).toHaveProperty('service.yaml')
  })

  it('creates deterministic template capabilities', () => {
    const project = generateProject({
      projectType: 'CI/CD',
      difficulty: 'Beginner',
      requirement: 'A safe delivery pipeline',
      generationMode: 'template',
    })

    expect(project.title).toBe('Beginner CI/CD Project')
    expect(project.generationMode).toBe('template')
    expect(project.files).toHaveProperty('.github/workflows/deploy.yml')
    expect(project.tools).toEqual(['GitHub Actions', 'GHCR', 'Trivy'])
  })

  it('tracks guest usage and enforces the guest limit', () => {
    expect(getGuestCount()).toBe(0)
    expect(guestLimitReached()).toBe(false)

    incrementGuestCount()
    incrementGuestCount()
    expect(incrementGuestCount()).toBe(3)
    expect(guestLimitReached()).toBe(true)
  })

  it('upserts, filters, and deletes locally stored projects', () => {
    saveProject({ id: 'guest-project', owner: 'guest', title: 'Guest' })
    saveProject({ id: 'user-project', owner: 'owner@example.com', title: 'First' })
    saveProject({ id: 'user-project', owner: 'owner@example.com', title: 'Updated' })

    expect(getProjects()).toHaveLength(2)
    expect(projectsForUser(null).map((project) => project.id)).toEqual(['guest-project'])
    expect(projectsForUser({ email: 'owner@example.com' })[0].title).toBe('Updated')

    deleteProject('user-project')
    expect(getProjects().map((project) => project.id)).toEqual(['guest-project'])
  })
})
