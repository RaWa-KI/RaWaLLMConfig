import { existsSync, readFileSync } from 'node:fs'

export const CHANGELOG_APPROVAL_ENV = 'RAWALLM_CHANGELOG_CHAT_APPROVED'

const GERMAN_MARKERS = [
  ' und ', ' ist ', ' sind ', ' bleibt', ' bleiben', ' wurde', ' werden',
  ' quelle', ' pruef', ' prüf', ' verständlich', ' oeffentlich', ' öffentlich'
]

const ENGLISH_MARKERS = [
  ' this version ', ' public ', ' source ', ' updates', ' update ', ' startup ',
  ' navigation ', ' clearer ', ' default ', ' release '
]

export function isChatApproved(env = process.env) {
  return env[CHANGELOG_APPROVAL_ENV] === '1'
}

export function validateGermanReleaseNotes(body) {
  const text = body.trim()
  const lower = ` ${text.toLowerCase()} `
  const issues = []

  if (!text) issues.push('RELEASE_NOTES.md ist leer.')
  if (!text.startsWith('# RaWaLLMConfig ')) {
    issues.push('RELEASE_NOTES.md muss mit "# RaWaLLMConfig <version>" beginnen.')
  }

  const markerCount = GERMAN_MARKERS.filter((marker) => lower.includes(marker)).length
  if (markerCount < 2) {
    issues.push('RELEASE_NOTES.md wirkt nicht deutsch genug fuer den Release-Standard.')
  }

  if (!/^##\s+Deutsch\s*$/im.test(text)) {
    issues.push('RELEASE_NOTES.md braucht einen Abschnitt "## Deutsch".')
  }

  if (!/^##\s+English\s*$/im.test(text)) {
    issues.push('RELEASE_NOTES.md braucht einen Abschnitt "## English".')
  }

  const englishMarkerCount = ENGLISH_MARKERS.filter((marker) => lower.includes(marker)).length
  if (englishMarkerCount < 2) {
    issues.push('RELEASE_NOTES.md braucht eine englische Zusammenfassung fuer GitHub.')
  }

  return issues
}

export function buildReleaseNotesPreview(version, body) {
  return [
    '=== CHAT-VORSCHAU: RELEASE_NOTES.md ===',
    `Version: ${version}`,
    '',
    body.trim(),
    '',
    '=== ENDE CHAT-VORSCHAU ==='
  ].join('\n')
}

export function readReleaseNotes(notesPath) {
  if (!existsSync(notesPath)) {
    throw new Error('RELEASE_NOTES.md fehlt. Kein Manifest ohne freigegebenen Changelog.')
  }
  return readFileSync(notesPath, 'utf8')
}

export function requireReleaseNotesGate({ notesPath, version, env = process.env, log = console.error }) {
  const body = readReleaseNotes(notesPath)
  const issues = validateGermanReleaseNotes(body)

  if (issues.length || !isChatApproved(env)) {
    log(buildReleaseNotesPreview(version, body))
    if (issues.length) {
      log(`\nChangelog-Gate FAIL:\n- ${issues.join('\n- ')}`)
    }
    if (!isChatApproved(env)) {
      log(`\nChangelog-Gate STOP: Bitte diese Vorschau zuerst im Chat freigeben lassen.`)
      log(`Danach erneut ausfuehren mit: ${CHANGELOG_APPROVAL_ENV}=1`)
    }
    throw new Error('release-notes-chat-review-required')
  }

  return body
}
