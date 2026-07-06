// Installiert den versionierten pre-commit-Hook nach .git/hooks (WP24).
// Idempotent; vorhandene fremde Hook-Datei wird nie still überschrieben (HR7-Geist: Backup).
import { existsSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'scripts', 'git-hooks', 'pre-commit')
const dst = resolve(root, '.git', 'hooks', 'pre-commit')

if (!existsSync(resolve(root, '.git'))) {
  console.error('hooks:install: kein .git-Verzeichnis gefunden — Abbruch.')
  process.exit(1)
}

// LF erzwingen: core.autocrlf=true kann die Quelle mit CRLF auschecken, CRLF bricht sh.
const content = readFileSync(src, 'utf8').replace(/\r\n/g, '\n')

if (existsSync(dst)) {
  const existing = readFileSync(dst, 'utf8').replace(/\r\n/g, '\n')
  if (existing === content) {
    console.log('hooks:install: pre-commit bereits aktuell — nichts zu tun.')
    process.exit(0)
  }
  const bak = `${dst}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
  copyFileSync(dst, bak)
  console.log(`hooks:install: vorhandene Hook gesichert nach ${bak}`)
}

writeFileSync(dst, content, 'utf8')
try {
  chmodSync(dst, 0o755)
} catch {
  // Windows: chmod ohne Wirkung — git for Windows führt Hooks via sh aus.
}
console.log('hooks:install: pre-commit installiert (typecheck-Gate aktiv).')
