import { mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAllowedPublicPath, isForbiddenPath } from './public-release-config.mjs'
import { copyPublicFile, fileExists, isInside, normalizeRel, walkFiles } from './path-utils.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function defaultTarget() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return resolve(tmpdir(), `rawallmconfig-public-alpha-${stamp}`)
}

async function assertSafeTarget(targetRoot) {
  if (resolve(targetRoot) === repoRoot || isInside(repoRoot, targetRoot)) {
    throw new Error(`Export target must be outside the repo: ${targetRoot}`)
  }
  if (isInside(targetRoot, repoRoot)) {
    throw new Error(`Export target must not contain the repo: ${targetRoot}`)
  }
  if (await fileExists(targetRoot)) {
    const entries = await readdir(targetRoot)
    if (entries.length > 0) {
      throw new Error(`Export target already exists and is not empty: ${targetRoot}`)
    }
  }
}

function shouldCopy(relPath) {
  if (isForbiddenPath(relPath)) return false
  return isAllowedPublicPath(relPath)
}

async function collectFiles() {
  const files = []
  for await (const absPath of walkFiles(repoRoot)) {
    const relPath = normalizeRel(relative(repoRoot, absPath))
    if (shouldCopy(relPath)) files.push(relPath)
  }
  return files.sort()
}

async function exportFiles(targetRoot, files) {
  await mkdir(targetRoot, { recursive: true })
  for (const relPath of files) {
    await copyPublicFile(repoRoot, targetRoot, relPath)
  }
}

async function main() {
  const targetRoot = resolve(process.argv[2] || process.env.PUBLIC_RELEASE_DIR || defaultTarget())
  await assertSafeTarget(targetRoot)
  const files = await collectFiles()
  await exportFiles(targetRoot, files)
  console.log(`public-release: exported ${files.length} files`)
  console.log(`public-release: target ${targetRoot}`)
  console.log('public-release: next run pnpm release:verify "<target>"')
}

main().catch((error) => {
  console.error(`public-release: FAIL ${error.message}`)
  process.exit(1)
})
