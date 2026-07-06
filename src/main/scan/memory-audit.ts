// Isolated _memory audit. Not wired into scan-index/buildData yet.
import fs from 'node:fs'
import path from 'node:path'

export interface MemoryFilesAudit {
  memoryIndexPath: string
  memoryDir: string
  indexed: string[]
  onDisk: string[]
  missingInIndex: string[]
  missingOnDisk: string[]
}

export function collectMemoryFiles(agentDir: string): MemoryFilesAudit {
  const memoryIndexPath = path.join(agentDir, 'MEMORY.md')
  const memoryDir = path.join(agentDir, '_memory')
  const indexed = readMemoryIndex(memoryIndexPath)
  const onDisk = readMemoryDir(memoryDir)
  return {
    memoryIndexPath,
    memoryDir,
    indexed,
    onDisk,
    missingInIndex: diffNames(onDisk, indexed),
    missingOnDisk: diffNames(indexed, onDisk),
  }
}

function readMemoryIndex(memoryIndexPath: string): string[] {
  let text = ''
  try {
    text = fs.readFileSync(memoryIndexPath, 'utf8')
  } catch {
    return []
  }
  const found = new Set<string>()
  const rx = /(?:^|[\s([`])(?:_memory[\\/])?([A-Za-z0-9._-]+\.md)(?=$|[\s)\]`])/g
  let match: RegExpExecArray | null
  while ((match = rx.exec(text)) !== null) found.add(match[1])
  return [...found].sort()
}

function readMemoryDir(memoryDir: string): string[] {
  try {
    return fs.readdirSync(memoryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function diffNames(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.map((name) => name.toLowerCase()))
  return left.filter((name) => !rightSet.has(name.toLowerCase())).sort()
}
