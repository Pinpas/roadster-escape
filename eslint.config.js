import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'coverage/', '.wrangler/', '.verify/', '**/test-results/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['vite.config.ts'],
          defaultProject: 'tsconfig.node.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*', '../*'],
              message:
                'src/sim is pure simulation: no three.js and no imports from outside src/sim.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          checkGlobalObject: true,
          globals: [
            ...['window', 'document', 'navigator', 'performance', 'requestAnimationFrame'].map(
              (name) => ({ name, message: 'src/sim must not touch the DOM or wall-clock time.' }),
            ),
            {
              name: 'globalThis',
              message: 'src/sim reads no globals; globalThis is a back door to Date and Math.',
            },
            ...['Date', 'Intl'].map((name) => ({
              name,
              message: 'Simulation time comes from fixed steps.',
            })),
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'src/sim loads no modules at run time.',
        },
        {
          selector: "MemberExpression[property.name='random']",
          message: 'Use the seeded Rng from src/sim/rng.ts.',
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng from src/sim/rng.ts.' },
      ],
    },
  },
  prettier,
);
