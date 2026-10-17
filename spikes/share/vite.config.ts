import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type Plugin } from 'vite';

const outDir = resolve(import.meta.dirname, 'out');

// Dev-only sink so phones on the Tailnet and headless runs can hand their MP4s and
// capability reports back to the box for ffprobe.
function artifactSink(): Plugin {
  return {
    name: 'artifact-sink',
    configureServer(server) {
      server.middlewares.use('/__artifact', (req, res) => {
        if (req.method !== 'POST') return res.writeHead(405).end();
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'unnamed.bin';
        const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync(outDir, { recursive: true });
          writeFileSync(resolve(outDir, safe), Buffer.concat(chunks));
          res.writeHead(204).end();
        });
      });
    },
  };
}

// SPIKE_HTTPS=1 serves a self-signed cert on 5105: VideoEncoder and navigator.share
// exist only in secure contexts, and plain http over the Tailnet is not one.
const https = process.env.SPIKE_HTTPS === '1';

export default defineConfig({
  plugins: [artifactSink(), ...(https ? [basicSsl()] : [])],
  server: {
    host: true,
    port: https ? 5105 : 5104,
    strictPort: true,
    allowedHosts: ['hugo-agentbox-macbookpro'],
  },
});
