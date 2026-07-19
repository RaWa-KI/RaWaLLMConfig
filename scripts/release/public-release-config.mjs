export const ROOT_FILES = new Set([
  '.npmrc',
  '.dockerignore',
  '.gitignore',
  'Dockerfile',
  'CLA.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'NOTICE',
  'README.md',
  'SECURITY.md',
  'electron-builder.yml',
  'electron.vite.config.ts',
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'tsconfig.json'
])

export const DOC_FILES = new Set([
  'docs/PUBLIC-RELEASE-SCOPE.md',
  'docs/THIRD-PARTY-NOTICES.md'
])

export const GITHUB_FILES = new Set([
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/pull_request_template.md',
  '.github/workflows/ci.yml'
])

export const SCRIPT_FILES = new Set([
  'scripts/audit-probe/bridge-checks.mjs',
  'scripts/audit-probe/dump-verify.mjs',
  'scripts/audit-probe/launch.mjs',
  'scripts/audit-probe/perf-metrics.mjs',
  'scripts/audit-probe/process-control.mjs',
  'scripts/audit-probe/qa-helpers.mjs',
  'scripts/audit-probe/timeouts.mjs',
  'scripts/audit-probe/ui-checks.mjs',
  'scripts/gen-icon.cjs',
  'scripts/generate-update-manifest.mjs',
  'scripts/git-hooks/pre-commit',
  'scripts/install-git-hooks.mjs',
  'scripts/linux-package-smoke.mjs',
  'scripts/perf-smoke.mjs',
  'scripts/ui-smoke.mjs',
  'scripts/ui-smoke-flows.mjs'
])

export const FORBIDDEN_DIR_NAMES = new Set([
  '.agents',
  '.claude',
  '.codex',
  '.git',
  '.rawallmconfig',
  '.remember',
  '.vite',
  '_entpackt',
  'dist',
  'dist-release',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
  'vendor'
])

export const FORBIDDEN_EXTENSIONS = new Set([
  '.7z',
  '.db',
  '.dll',
  '.dmg',
  '.exe',
  '.gz',
  '.key',
  '.msi',
  '.p12',
  '.p7z',
  '.pem',
  '.pfx',
  '.rar',
  '.sqlite',
  '.sqlite3',
  '.tar',
  '.tgz',
  '.zip'
])

export function isAllowedPublicPath(relPath) {
  if (ROOT_FILES.has(relPath) || DOC_FILES.has(relPath)) return true
  if (GITHUB_FILES.has(relPath)) return true
  if (SCRIPT_FILES.has(relPath) || relPath.startsWith('scripts/release/')) return true
  if (relPath === 'build/icon.ico' || relPath === 'build/icon.png') return true
  if (relPath.startsWith('docs/brand/')) return true
  if (relPath.startsWith('src/')) return true
  if (relPath.startsWith('shared/')) return true
  return relPath.startsWith('tests/write/')
}

export function isForbiddenPath(relPath) {
  const parts = relPath.split('/')
  if (parts.includes('caudex') && parts.includes('vendor')) return true
  return parts.some((part) => FORBIDDEN_DIR_NAMES.has(part))
}
