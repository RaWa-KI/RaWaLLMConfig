import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Build via electron-vite (lose Tooling-Andockung; Phase 1 kein Tooling-Gate noetig).
// Dev-Port 5179 (Owner-Pin, registriert in localhost-ports.json) — NICHT 5173.
// externalizeDepsPlugin: 'electron' + node-Deps bleiben Runtime-extern (nicht bundeln!).
const sharedAlias = { '@shared': resolve(__dirname, 'shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: sharedAlias },
    plugins: [
      react(),
      // CORS-Fix (zusaetzliche Absicherung): Vite fuegt crossorigin-Attribute an
      // <script type="module"> und <link> ein. Auch mit app://-Origin koennen diese
      // einen CORS-Preflight ausloesen. Entfernung verhindert das vollstaendig.
      // Muster aus RawaLite vite.config.mts uebernommen.
      {
        name: 'remove-crossorigin',
        transformIndexHtml(html: string): string {
          return html.replace(/ crossorigin/g, '')
        }
      }
    ],
    server: { port: 5179, strictPort: true },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react-vendor'
            }
            if (
              id.includes('@codemirror') ||
              id.includes('node_modules/codemirror') ||
              id.includes('@lezer')
            ) {
              return 'codemirror'
            }
          }
        }
      }
    }
  }
})
