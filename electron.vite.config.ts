import { resolve } from 'path'
import type { Plugin } from 'vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Sandboxed Electron preloads may only load their single entry script.
 * Multi-entry Rollup builds extract shared modules into `chunks/*.js`, which
 * then fail at runtime (`module not found: ./chunks/...`) and leave
 * `window.browgent` undefined — every chrome click dies.
 *
 * Fail the preload build loudly if a shared chunk is emitted.
 */
function assertNoPreloadChunks(): Plugin {
  return {
    name: 'assert-no-preload-chunks',
    generateBundle(_options, bundle) {
      const shared = Object.keys(bundle).filter(
        (file) =>
          file.includes('chunks/') ||
          (bundle[file]?.type === 'chunk' &&
            !(bundle[file] as { isEntry?: boolean }).isEntry)
      )
      if (shared.length === 0) return
      throw new Error(
        `[browgent] Preload build emitted shared chunks that sandbox cannot load:\n` +
          shared.map((f) => `  - ${f}`).join('\n') +
          `\nDo not share value imports across preload entries (index / guest / pet).`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), assertNoPreloadChunks()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          // Guest tabs: Chrome-like identity patches (registered on page session)
          guest: resolve(__dirname, 'src/preload/guest.ts'),
          // Floating agent companion overlay (above guest WebContentsViews)
          pet: resolve(__dirname, 'src/preload/pet.ts')
        },
        output: {
          // Prefer self-contained CJS entries (no cross-entry shared chunks)
          format: 'cjs',
          entryFileNames: '[name].js',
          // If a chunk is ever emitted, assertNoPreloadChunks fails the build
          chunkFileNames: 'chunks/[name]-[hash].js'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Split vendor code out of the app chunk so cold start parses less
          // and dependency churn doesn't invalidate the whole app bundle.
          manualChunks(id: string): string | undefined {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('lucide')) return 'icons'
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
            return 'vendor'
          }
        }
      }
    }
  }
})
