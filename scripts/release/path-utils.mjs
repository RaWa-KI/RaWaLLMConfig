import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

export function normalizeRel(pathText) {
  return pathText.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function isInside(parentPath, childPath) {
  const rel = relative(resolve(parentPath), resolve(childPath))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export async function fileExists(pathText) {
  try {
    await stat(pathText)
    return true
  } catch {
    return false
  }
}

export async function ensureParent(filePath) {
  await mkdir(dirname(filePath), { recursive: true })
}

export async function copyPublicFile(sourceRoot, targetRoot, relPath) {
  const sourcePath = resolve(sourceRoot, relPath)
  const targetPath = resolve(targetRoot, relPath)
  await ensureParent(targetPath)
  await copyFile(sourcePath, targetPath)
}

export async function* walkFiles(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true })
  for (const entry of entries) {
    const nextPath = resolve(rootPath, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(nextPath)
    } else if (entry.isFile()) {
      yield nextPath
    }
  }
}

export async function readTextFile(pathText, maxBytes = 5 * 1024 * 1024) {
  const info = await stat(pathText)
  if (info.size > maxBytes) return null
  const buffer = await readFile(pathText)
  if (buffer.includes(0)) return null
  return buffer.toString('utf8')
}
