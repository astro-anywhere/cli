import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
  },
  format: ['esm'],
  target: 'node18',
  clean: true,
  banner: ({ entryPoint }) =>
    entryPoint?.endsWith('index.ts')
      ? { js: '#!/usr/bin/env node' }
      : undefined,
})
