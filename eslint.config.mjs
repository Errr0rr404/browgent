// Flat ESLint config — focused, high-signal rules for an Electron + React + TS app.
// Scope: the app source under src/. Build output, deps, scripts and the landing
// page are intentionally out of scope (the .mjs scripts are plain Node and are
// covered by `node --check`).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'release/', 'node_modules/', '**/*.tsbuildinfo'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node, ...globals.browser }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Type-aware rules that catch real Electron/async bugs (the code already
      // uses `void` deliberately to satisfy these).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Guest-isolation invariants: never ship an insecure WebContents config.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='nodeIntegration'][value.value=true]",
          message: 'Guest isolation invariant: nodeIntegration must stay false.'
        },
        {
          selector: "Property[key.name='contextIsolation'][value.value=false]",
          message: 'Guest isolation invariant: contextIsolation must stay true.'
        },
        {
          selector: "Property[key.name='webSecurity'][value.value=false]",
          message: 'Security invariant: webSecurity must not be disabled.'
        }
      ],
      // Noise → warnings (don't fail CI), signal → errors.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // Control chars in regexes are intentional in this codebase (binary/plaintext
      // sniffing of decrypted blobs, filename sanitization) — only false positives here.
      'no-control-regex': 'off'
    }
  }
)
