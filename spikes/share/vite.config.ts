import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
        const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(mp4|webm|json)$/.test(safe)) return res.writeHead(400).end();
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 50_000_000) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          mkdirSync(outDir, { recursive: true });
          writeFileSync(resolve(outDir, safe), Buffer.concat(chunks));
          res.writeHead(204).end();
        });
      });
    },
  };
}

// SPIKE_HTTPS=1 serves HTTPS on 5105: VideoEncoder and navigator.share exist only in
// secure contexts, and plain http over the Tailnet is not one. SPIKE_CERT and SPIKE_KEY
// point at a `tailscale cert` pair that phones trust; without them the cert is self-signed.
const https = process.env.SPIKE_HTTPS === '1';
const { SPIKE_CERT, SPIKE_KEY } = process.env;
const trustedCert = https && SPIKE_CERT && SPIKE_KEY ? { cert: readFileSync(SPIKE_CERT), key: readFileSync(SPIKE_KEY) } : undefined;

export default defineConfig({
  base: './',
  build: { license: true },
  plugins: [artifactSink(), ...(https && !trustedCert ? [basicSsl()] : [])],
  server: {
    host: true,
    port: https ? 5105 : 5104,
    strictPort: true,
    https: trustedCert,
    allowedHosts: ['hugo-agentbox-macbookpro', 'hugo-agentbox-macbookpro.tail56275f.ts.net'],
  },
});
