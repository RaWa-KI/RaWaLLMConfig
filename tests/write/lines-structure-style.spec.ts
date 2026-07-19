import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseCss = readFileSync(resolve(process.cwd(), 'src/renderer/styles/base.css'), 'utf8')
const tokensCss = readFileSync(resolve(process.cwd(), 'src/renderer/styles/tokens.css'), 'utf8')

test('lines keeps the work surface free of retro grid and grain', () => {
  expect(baseCss).toContain('html[data-structure="retro"] body')
  expect(baseCss).toContain('html[data-structure="lines"] body::after { content: none; }')
  expect(tokensCss).toMatch(/html\[data-structure="lines"\][\s\S]*?--grain-opacity:\s*0;/)
})
