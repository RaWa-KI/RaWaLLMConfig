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
  '.github/pull_request_template.md'
])

export const SCRIPT_FILES = new Set([
  'scripts/generate-update-manifest.mjs',
  'scripts/git-hooks/pre-commit',
  'scripts/install-git-hooks.mjs'
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
  if (relPath === 'build/icon.ico') return true
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
