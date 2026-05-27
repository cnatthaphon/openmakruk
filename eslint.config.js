// Flat config — minimal lint for OpenMakruk.
//
// Scope: catch the regressions that hurt most over time —
//   * unused vars and imports
//   * React hooks dep arrays
//   * obvious correctness issues in TS
//
// We deliberately DO NOT enable style rules (semis, quotes, line
// length) here. Prettier handles formatting; ESLint runs ahead of
// Prettier in CI but only flags semantic problems.
//
// Run: `npm run lint` (CI gate) · `npm run lint:fix` (local autofix)

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'worker/node_modules/**',
      '*.config.js',
      '*.config.ts',
      'public/sw.js',
      'public/engine/**',
      'worker/.wrangler/**',
      'worker/dist/**',
      'worker/seed-curated.sql',
      'tests/e2e/.storage-state.json',
      // Ad-hoc QA scripts use browser globals (PerformanceObserver,
      // performance, sessionStorage) inside page.evaluate() callbacks
      // that ESLint can't see across the playwright boundary. They're
      // not source code — exclude from the lint gate.
      'scripts/qa-*.mjs',
      'scripts/smoke-prod-deep.mjs',
      'scripts/visual-audit.mjs',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        IDBOpenDBRequest: 'readonly',
        fetch: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        crypto: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        TextEncoder: 'readonly',
        Worker: 'readonly',
        WebAssembly: 'readonly',
        // CacheStorage — used by lazyRetry.ts to wipe stale caches on
        // chunk-load failure recovery.
        caches: 'readonly',
        // Audio
        Audio: 'readonly',
        AudioContext: 'readonly',
        // Timers
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // Common
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react': reactPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // TypeScript handles `no-undef` better than ESLint's check;
      // turn the latter off so legitimate TS-only types don't error.
      'no-undef': 'off',
      // Unused-vars: allow underscore prefix as the explicit "I know,
      // it's intentional" escape hatch (already used in our codebase).
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // React hooks rules of hooks + exhaustive deps. Warn (not error)
      // for exhaustive-deps because there are several intentional
      // omissions in App.tsx that would be noisy to suppress one by one.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Don't require React import (React 17+ JSX transform).
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // We sometimes throw an Error subclass — useless if it loses
      // info but ESLint sees it as no-op. Disable.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Prefer `const` for non-reassigned bindings.
      'prefer-const': 'warn',
      // Production CSP allows 'unsafe-eval' SPECIFICALLY because the
      // bundled ffish-es6 needs it. Our own code must never reach for
      // eval/Function — these rules make a new eval() in our source
      // fail CI, keeping the CSP allowance scoped to vendor code only.
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    // Node/Vite/test scripts. Node 18+ ships fetch/Response/URL as
    // globals; declare them here so smoke probes don't trip no-undef.
    files: ['scripts/**/*.{js,mjs,cjs}', 'worker/scripts/**/*.{js,mjs}', '*.config.{js,ts}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // Some smoke scripts probe through a headless browser
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
];
