import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5101,
    strictPort: true,
    allowedHosts: ['hugo-agentbox-macbookpro'],
  },
});
