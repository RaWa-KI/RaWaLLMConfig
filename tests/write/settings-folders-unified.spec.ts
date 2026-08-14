import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const prefs = read('src/renderer/sections/prefs/PrefsSection.tsx')
const folders = read('src/renderer/sections/quellen/SourcesSection.tsx')
const moduleCard = read('src/renderer/sections/integrations/shared/IntegrationCard.tsx')
const modules = read('src/renderer/sections/integrations/IntegrationsSection.tsx')
const onboarding = read('src/renderer/sections/onboarding/OnboardingFlow.tsx')

test('alle konfigurierbaren Ordner erscheinen im Tab Ordner statt unter Darstellung oder Module', () => {
  expect(prefs).not.toContain('<RootRows')
  expect(folders).toContain('<RootRows prefs={prefs}')
  expect(folders).toContain('<ModuleFolderAssignments />')
  expect(modules).toContain('Ordner ordnest du in Einstellungen → Ordner zu.')
  expect(modules).toContain('showFolderAction={false}')
  expect(moduleCard).toContain('showFolderAction &&')
})

test('ordner- und onboarding-copy trennt Konfiguration, Modelle und optionale Anbieter', () => {
  expect(folders).toContain('Konfigurationsordner enthalten Einstellungen. Lokale Modellordner enthalten Modelle.')
  expect(folders).toContain('die du nutzt oder die die App erkannt hat')
  expect(onboarding).toContain('Konfigurationsordner\n        und Modellordner bleiben getrennt')
  expect(onboarding).toContain('Einrichtung abschließen')
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
