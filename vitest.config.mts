import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'shared'),
      '@': resolve(import.meta.dirname, 'web/src'),
    },
  },
  test: {
    include: [
      'shared/**/*.test.ts',
      'web/src/prompt/**/*.test.ts',
      'web/src/utils/**/*.test.ts',
    ],
    environment: 'node',
  },
})
