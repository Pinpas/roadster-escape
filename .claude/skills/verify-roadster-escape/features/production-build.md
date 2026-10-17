# Production build

The deployed game is the Vite build in `dist/`, served as static assets by Cloudflare Workers. Hashed files under `/assets/` are cached for a year, and `index.html` is revalidated on every request.

## Sub-features

- `build-size` builds with a JS bundle whose gzip size `npm run build` prints.
- `cf-serve` serves the build with the local Workers runtime.
- `cf-cache` sends the cache headers from `public/_headers`.
- `build-base` builds for a sub-path with `npm run build -- --base=/<path>/`.

## How to get to it (user POV)

- Production is the URL of the `roadster-escape` Worker. Each non-main branch gets a Worker Preview from Cloudflare Workers Builds.
- Locally, `wrangler dev` on port 5106 stands in for both.

## Driving it with T3 preview and Playwright

Preconditions:

- `scripts/dev-server.sh start-cf` reports `doctor: OK` on port 5106. It builds `dist/` first.

- **Headers.** Run `curl -sI http://hugo-agentbox-macbookpro:5106/` and `curl -sI http://hugo-agentbox-macbookpro:5106/assets/<file>.js` with a file name from `dist/assets/`. The first shows `Cache-Control: public, max-age=0, must-revalidate`. The second shows `Cache-Control: public, max-age=31536000, immutable`. `/_headers` itself returns 404.
- **Render.** Drive the Empty scene recipe against `http://hugo-agentbox-macbookpro:5106/?still&dpr=1` at both sizes. Every network entry returns 200 and the console holds no error.
- **Sub-path.** Run `~/projects/agentbox/scripts/heavy npm run build -- --base=/sub/`, then `grep -o 'src="[^"]*"' dist/index.html`. The script path starts with `/sub/assets/`. Rebuild without `--base` afterwards.
- **Cleanup.** Run `scripts/dev-server.sh stop 5106` and close the tab.

## Gotchas

- `wrangler dev` needs no Cloudflare login for static assets. Never run `wrangler login`, `wrangler deploy`, `wrangler preview`, `wrangler versions upload`, or `wrangler secret put` from this box. Deploys and previews run in Cloudflare Workers Builds.
- `wrangler dev` serves whatever is in `dist/`. After a change, run `scripts/dev-server.sh stop 5106`, then `start-cf` again, because `start-cf` rebuilds and refuses a busy port.
- Killing only the `wrangler` process leaves `workerd` holding port 5106. `stop` kills the whole process group.
