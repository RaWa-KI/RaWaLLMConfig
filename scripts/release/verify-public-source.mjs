import { extname, relative, resolve } from 'node:path'
import { isAllowedPublicPath, isForbiddenPath, FORBIDDEN_EXTENSIONS } from './public-release-config.mjs'
import { fileExists, normalizeRel, readTextFile, walkFiles } from './path-utils.mjs'

const PATTERNS = [
  { label: 'private-windows-user-path', regex: /C:[\\/]+Users[\\/]+(?!u(?:[\\/]|$)|Public(?:[\\/]|$)|Default(?:[\\/]|$)|Default User(?:[\\/]|$)|All Users(?:[\\/]|$))[^\\/]+/i },
  { label: 'private-archive-drive-path', regex: /\bE:[\\/]/i },
  { label: 'file-dependency-protocol', metadata: true, regex: new RegExp(String.raw`\b` + 'file' + String.raw`:(\.|\/|[A-Za-z]:)`, 'i') },
  { label: 'link-dependency-protocol', metadata: true, regex: new RegExp(String.raw`\b` + 'link' + String.raw`:(\.|\/|[A-Za-z]:)`, 'i') },
  { label: 'git-file-dependency', metadata: true, regex: new RegExp('git' + String.raw`\+` + 'file' + ':', 'i') },
  { label: 'private-caudex-scope', regex: new RegExp('@' + 'caudex' + String.raw`[\\/A-Za-z0-9_-]*`, 'i') },
  { label: 'vendored-caudex-path', regex: /vendor[\\/]+caudex/i },
  { label: 'secret-env-assignment', regex: /\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|CLIENT_SECRET)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/i },
  { label: 'api-key-shape', regex: /\bsk-[A-Za-z0-9_-]{20,}/ }
]

function addIssue(issues, relPath, label, line = null) {
  issues.push({ relPath, label, line })
}

function isAllowedBinary(relPath) {
  return relPath === 'build/icon.ico' || relPath === 'build/icon.png'
}

function checkPath(relPath, issues) {
  if (!isAllowedPublicPath(relPath)) addIssue(issues, relPath, 'not-in-public-allowlist')
  if (isForbiddenPath(relPath)) addIssue(issues, relPath, 'forbidden-path')
}

function checkExtension(relPath, issues) {
  const ext = extname(relPath).toLowerCase()
  if (FORBIDDEN_EXTENSIONS.has(ext) && !isAllowedBinary(relPath)) {
    addIssue(issues, relPath, `forbidden-extension:${ext}`)
  }
}

function isMetadataFile(relPath) {
  return relPath === 'package.json' || relPath === 'pnpm-lock.yaml' || relPath === '.npmrc'
}

function isDummySecretFixture(label, line) {
  if (label !== 'api-key-shape' && label !== 'secret-env-assignment') return false
  return /DUMMY/i.test(line)
}

function scanText(relPath, text, issues) {
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    for (const pattern of PATTERNS) {
      if (pattern.metadata && !isMetadataFile(relPath)) continue
      if (isDummySecretFixture(pattern.label, line)) continue
      if (pattern.regex.test(line)) {
        addIssue(issues, relPath, pattern.label, index + 1)
      }
    }
  }
}

async function scanFile(rootPath, absPath, issues) {
  const relPath = normalizeRel(relative(rootPath, absPath))
  checkPath(relPath, issues)
  checkExtension(relPath, issues)
  const text = await readTextFile(absPath)
  if (text !== null) scanText(relPath, text, issues)
}

async function scanTree(rootPath) {
  const issues = []
  for await (const absPath of walkFiles(rootPath)) {
    await scanFile(rootPath, absPath, issues)
  }
  return issues
}

function printIssues(issues) {
  for (const issue of issues) {
    const lineText = issue.line === null ? '' : `:${issue.line}`
    console.error(`FAIL ${issue.relPath}${lineText} ${issue.label}`)
  }
}

async function main() {
  const rootPath = resolve(process.argv[2] || process.env.PUBLIC_RELEASE_DIR || '')
  if (!rootPath || !(await fileExists(rootPath))) {
    throw new Error('usage: pnpm release:verify "<export-dir>"')
  }
  const issues = await scanTree(rootPath)
  if (issues.length > 0) {
    printIssues(issues)
    throw new Error(`${issues.length} public-release issue(s) found`)
  }
  console.log(`public-release: PASS ${rootPath}`)
}

main().catch((error) => {
  console.error(`public-release: FAIL ${error.message}`)
  process.exit(1)
})
