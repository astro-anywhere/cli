import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    tui: 'src/tui/index.tsx',
  },
  format: ['esm'],
  target: 'node18',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
  external: ['ink', '@inkjs/ui', 'react', 'react/jsx-runtime', 'zustand', 'fuse.js'],
})
