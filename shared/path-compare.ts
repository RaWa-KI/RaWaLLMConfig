// Pure Pfadvergleichs-Primitiven fuer Main und Renderer. Main injiziert
// process.platform; Renderer nutzt navigator.platform und nur in Node/SSR die
// begrenzte String-Inferenz. POSIX behandelt Backslash als Namenszeichen.

export type PathComparisonPlatform = 'win32' | 'linux' | 'darwin'

export interface PlatformPathParts {
  prefix: string
  segments: string[]
}

function isWindowsPlatform(platform: string): boolean {
  return /^win/i.test(platform)
}

export function pathComparisonPlatformFor(...values: string[]): 'win32' | 'linux' {
  return values.some((value) => /^[a-zA-Z]:[\\/]/.test(value.trim()) || /^\\\\/.test(value.trim()))
    ? 'win32'
    : 'linux'
}

export function rendererPathComparisonPlatformFor(...fallbackValues: string[]): PathComparisonPlatform {
  if (typeof navigator !== 'undefined') {
    const platform = navigator.platform.toLowerCase()
    if (platform.includes('linux')) return 'linux'
    if (platform.includes('mac')) return 'darwin'
    if (platform.includes('win')) return 'win32'
  }
  return pathComparisonPlatformFor(...fallbackValues)
}

export function splitPathForPlatform(value: string, platform: string): PlatformPathParts {
  if (isWindowsPlatform(platform)) {
    const slashPath = value.replace(/\\/g, '/')
    const drive = /^([a-zA-Z]:)\/+/.exec(slashPath)
    if (drive) return {
      prefix: `${drive[1]}/`,
      segments: slashPath.slice(drive[0].length).split(/\/+/).filter(Boolean)
    }
    const unc = slashPath.startsWith('//')
    const prefix = unc ? '//' : slashPath.startsWith('/') ? '/' : ''
    const body = unc ? slashPath.replace(/^\/+/, '') : slashPath.slice(prefix.length)
    return { prefix, segments: body.split(/\/+/).filter(Boolean) }
  }
  const doubleRoot = value.startsWith('//') && !value.startsWith('///')
  const prefix = doubleRoot ? '//' : value.startsWith('/') ? '/' : ''
  return { prefix, segments: value.slice(prefix.length).split(/\/+/).filter(Boolean) }
}

export function normalizePathForCompare(value: string, platform: string): string {
  const parts = splitPathForPlatform(value, platform)
  const normalized = parts.prefix + parts.segments.join('/')
  return isWindowsPlatform(platform) ? normalized.toLowerCase() : normalized
}

function withoutTrailingSeparator(value: string): string {
  if (/^\/{1,2}$/.test(value) || /^[a-zA-Z]:\/$/.test(value)) return value
  return value.replace(/\/+$/, '')
}

export function pathsEqual(left: string, right: string, platform: string): boolean {
  return withoutTrailingSeparator(normalizePathForCompare(left, platform))
    === withoutTrailingSeparator(normalizePathForCompare(right, platform))
}

export function isPathEqualOrUnder(candidate: string, root: string, platform: string): boolean {
  const normalizedCandidate = withoutTrailingSeparator(normalizePathForCompare(candidate, platform))
  const normalizedRoot = withoutTrailingSeparator(normalizePathForCompare(root, platform))
  if (!normalizedCandidate || !normalizedRoot) return false
  if (normalizedCandidate === normalizedRoot) return true
  const prefix = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`
  return normalizedCandidate.startsWith(prefix)
}
