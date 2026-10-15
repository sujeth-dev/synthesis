// Plain .mjs on purpose: the Synaptic repo's root tsconfig globs every **/*.ts,
// so keeping config out of TypeScript means the main app's type-check never
// has to resolve Vite's types.
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 800 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
