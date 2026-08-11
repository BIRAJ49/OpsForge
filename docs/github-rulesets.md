# GitHub CI, Security, And Rulesets

OpsForge deliberately uses event-driven automation. Pull requests run
`.github/workflows/pr-check.yml`; pushes to protected `main` and operator-started
manual runs from `main` run `.github/workflows/build.yml`. Neither workflow has a
schedule. The build workflow rejects manual runs from any other ref.

The repository must have exactly one required application status check:

```text
CI and security gate
```

That stable aggregate fails unless backend and frontend quality, dependency
audits, Trivy source/configuration scans, the SonarQube quality gate, and exact
container-image scans all succeed. Do not separately require the implementation
job names; doing so makes the ruleset unnecessarily fragile when jobs are
refactored.

## Source Repository Ruleset

Create an active branch ruleset matching only `refs/heads/main` with:

- require a pull request before merging;
- require at least one approving review;
- require review from CODEOWNERS;
- dismiss stale approvals when new commits are pushed;
- require approval of the most recent push by someone other than its author;
- require every review conversation to be resolved;
- require `CI and security gate` from GitHub Actions;
- require the branch to be up to date before merging;
- block branch deletion and non-fast-forward updates;
- disallow force pushes;
- do not add RepositoryRole, administrator, DeployKey, or GitHub App bypasses.

Do not enable the ruleset's separate `update` restriction. The pull-request rule
already blocks direct pushes and still allows an approved PR to be merged. Do
not enable GitHub's separate `code_quality` rule for this repository; the
SonarQube result is already fail-closed inside the aggregate status.

Protect `.github/workflows/**`, `.github/CODEOWNERS`, dependency manifests,
release tooling, and `sonar-project.properties` through `.github/CODEOWNERS`.
For a team-owned production repository, replace the current single-owner entry
with platform and security teams. A PR author cannot approve their own PR, so a
second maintainer is required for independent approval.

## GitOps Repository Ruleset

Protect `BIRAJ49/OpsForge-GitOps` `main` separately with the same review,
conversation, deletion, force-push, and no-bypass controls. Require this exact,
strict status check:

```text
GitOps policy gate
```

The repository-scoped promotion GitHub App may push only its staging promotion
branch and open or edit pull requests. It must not bypass `main`, approve its own
PR, merge a PR, or have access to the application repository.

## Actions And Token Settings

Set both repositories to:

- default `GITHUB_TOKEN` permissions: read repository contents;
- allow Actions to create or approve pull requests: disabled;
- require actions to be pinned to a full commit SHA;
- allow only GitHub-authored actions and the explicitly approved Docker, Aqua
  Security, and SonarSource actions used by the two workflows.

The publish job alone receives `packages:write`, `id-token:write`, and
`attestations:write`. It downloads and verifies an already-scanned image bundle,
loads it, and publishes it without rebuilding. No application workflow should
receive Kubernetes, Argo CD, SSH, or production cloud credentials.

Keep both GHCR packages private. Grant the GitOps validation repository explicit
read access to the packages, and provide Kubernetes pull credentials through the
external secret store. Do not add a long-lived GHCR PAT to the application build;
same-repository publication uses the short-lived `GITHUB_TOKEN`.

## Required Configuration

Repository secrets:

| Name | Purpose |
| --- | --- |
| `SONAR_TOKEN` | Project-scoped SonarQube analysis token. |
| `SONAR_ROOT_CERT` | Optional private CA certificate for SonarQube TLS. |
| `GITOPS_APP_CLIENT_ID` | Client ID of the repository-scoped GitHub App. |
| `GITOPS_APP_PRIVATE_KEY` | Private key of that GitHub App. |

Repository variables:

| Name | Value or purpose |
| --- | --- |
| `SONAR_HOST_URL` | HTTPS URL of the SonarQube server. |
| `GITOPS_OWNER` | `BIRAJ49`, unless ownership changes. |
| `GITOPS_REPOSITORY` | `OpsForge-GitOps`. |
| `ENABLE_GITOPS_STAGING_PROMOTION` | Keep `false` until the staging overlay, GitOps validation, and Argo CD staging application are ready; then set exactly `true`. |

Delete the legacy `ENABLE_GITOPS_PROMOTION` variable. It is intentionally not
read by either workflow, so an old production-promotion switch cannot affect the
staging-only release path. Remove the legacy `GITOPS_DEPLOY_KEY`, `GHCR_TOKEN`,
and EC2 SSH secrets after confirming no out-of-repository operator process still
uses them.

The SonarQube project key must match `sonar.projectKey` in
`sonar-project.properties`. Configure the SonarQube quality gate to cover new
bugs, vulnerabilities, security hotspots, duplication, and test coverage.
Disable SonarQube GitHub PR decoration/comments if the repository should expose
only the aggregate Actions check.

The pull-request workflow intentionally fails closed when SonarQube secrets are
unavailable. If public fork contributions are accepted, a maintainer must bring
the commit onto a trusted repository branch before it can pass; do not switch
the workflow to `pull_request_target` or expose secrets to untrusted fork code.

The GitHub App installation must be limited to `OpsForge-GitOps` and have only
Contents read/write and Pull requests read/write. It must not have Actions,
Administration, Environments, Secrets, or package-write permissions.

## No Scheduled Or Bot Scanning

Keep these settings disabled:

- Dependabot version updates and `.github/dependabot.yml`;
- Dependabot security-update pull requests;
- GitHub CodeQL default setup and scheduled CodeQL workflows;
- scheduled GitHub Actions security or uptime workflows;
- GitGuardian's repository installation/check.

GitGuardian must be disabled or uninstalled in GitHub settings; there is no
repository file that can suppress an installed GitHub App check. SonarQube PR
decoration must likewise be disabled if only one visible status is desired.

Keep GitHub secret scanning and push protection enabled. They prevent a secret
from being committed and do not create dependency-update PRs. Trivy, pip-audit,
npm audit, SonarQube, and image scans run only in response to a PR, a protected
`main` release, or an explicit manual run from `main`. No SARIF is uploaded, so
the workflows do not create separate CodeQL or Trivy code-scanning checks.

## Current Formatting Baseline

The existing backend predates Ruff formatter enforcement and has broad format
debt. CI therefore runs Ruff lint across the complete backend but applies
`ruff format --check` only to Python files changed by the PR or exact `main`
commit. New changes cannot add format debt; the full-tree format check can be
enabled after a dedicated, reviewable formatting-only change.
