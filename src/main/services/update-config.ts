/**
 * update-config.ts - Quell-Auswahl fuer den Update-Manager.
 * SRP: Env-/Default-Entscheidung in eine testbare Stelle ziehen.
 */

import type { UpdateSourcePort } from './update-source-port'
import { createHttpsUpdateSource } from './update-source-https'
import { createLocalUpdateSource } from './update-source-local'

export const DEFAULT_RELEASE_URL =
  'https://github.com/RaWa-KI/RaWaLLMConfig/releases/latest/download/latest.json'

interface UpdateSourceEnv {
  RAWALLM_UPDATE_DIR?: string
  RAWALLM_RELEASE_URL?: string
}

function envValue(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export function resolveUpdateSource(env: UpdateSourceEnv = process.env): UpdateSourcePort {
  const updateDir = envValue(env.RAWALLM_UPDATE_DIR)
  if (updateDir) return createLocalUpdateSource(updateDir)

  const releaseUrl = envValue(env.RAWALLM_RELEASE_URL) ?? DEFAULT_RELEASE_URL
  if (releaseUrl) return createHttpsUpdateSource(releaseUrl)

  return createLocalUpdateSource(null)
}
