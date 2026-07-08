export type ExportReportKind = 'full' | 'conflicts'

export interface ExportReportMetadata {
  app: 'rawallmconfig'
  version: 1
  kind: ExportReportKind
  title: string
  filenamePrefix: string
  filter?: 'conflicts'
}

const FULL_EXPORT_METADATA: ExportReportMetadata = {
  app: 'rawallmconfig',
  version: 1,
  kind: 'full',
  title: 'Vollstaendiger Config-Export',
  filenamePrefix: 'rawallmconfig'
}

const CONFLICT_EXPORT_METADATA: ExportReportMetadata = {
  app: 'rawallmconfig',
  version: 1,
  kind: 'conflicts',
  title: 'Konflikt-Export',
  filenamePrefix: 'rawallmconfig-konflikte',
  filter: 'conflicts'
}

export function fullBundleReportMetadata(): ExportReportMetadata {
  return FULL_EXPORT_METADATA
}

export function conflictBundleReportMetadata(): ExportReportMetadata {
  return CONFLICT_EXPORT_METADATA
}

export function bundleDateStamp(exported: string): string {
  return exported.slice(0, 10)
}

export function fullBundleFilename(exported: string): string {
  return `${FULL_EXPORT_METADATA.filenamePrefix}-${bundleDateStamp(exported)}.json`
}

export function conflictBundleFilename(exported: string): string {
  return `${CONFLICT_EXPORT_METADATA.filenamePrefix}-${bundleDateStamp(exported)}.json`
}

export function bundleSummaryText(meta: ExportReportMetadata, entryCount: number): string {
  return `${meta.title}: ${entryCount} Eintraege`
}
