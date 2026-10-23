/**
 * ESLint 9 (flat config) del monorepo.
 *
 * Base: recomendado de JS + TypeScript (sin reglas con tipos, que duplican el
 * trabajo de `tsc --noEmit` y lo vuelven lento en CI). La web añade las reglas
 * de React Hooks y de Next, y eslint-config-prettier apaga todo lo que choca
 * con el formateador: el estilo lo decide Prettier, la corrección ESLint.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.vercel/**',
      '**/*.d.ts',
      // Diseño, documentación y utilidades sueltas no son código de la app.
      'diseno/**',
      'docs/**',
      '**/*.min.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // El prefijo `_` marca lo que se ignora a propósito (parámetros de firma).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` se tolera en mocks de test, pero se avisa en el resto del código.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Formularios de edición: los datos llegan por query y se hidratan UNA vez.
      // React Compiler lo marca como cascada, pero aquí no hay estado derivable.
      'react-hooks/set-state-in-effect': 'off',
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router: las fuentes se cargan una sola vez en app/layout.tsx.
      '@next/next/no-page-custom-font': 'off',
      '@next/next/google-font-display': 'off',
    },
  },

  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  // Los tests pueden usar `any`, consolas de depuración y variables sueltas.
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/vitest.setup.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Último: apaga las reglas de estilo que Prettier ya resuelve.
  prettier,
);