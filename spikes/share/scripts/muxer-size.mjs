import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const dir = resolve(import.meta.dirname, 'size');
for (const entry of readdirSync(dir)) {
  const r = await build({
    entryPoints: [resolve(dir, entry)],
    bundle: true,
    minify: true,
    format: 'esm',
    treeShaking: true,
    write: false,
    logLevel: 'silent',
  });
  const code = r.outputFiles[0].contents;
  console.log(`${entry.padEnd(20)} min ${(code.length / 1024).toFixed(1)} KiB  gzip ${(gzipSync(code, { level: 9 }).length / 1024).toFixed(1)} KiB`);
}
