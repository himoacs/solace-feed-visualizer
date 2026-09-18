import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { sempRouter } from './semp.js';

const PORT = Number(process.env.PORT) || 4001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Only populated in the production Docker image (see Dockerfile, which
// copies the web app's `vite build` output here). In local dev this
// directory doesn't exist - express.static below is a no-op per-request
// fallthrough, not a startup error, since the Vite dev server on :4300
// serves the app instead during development.
const STATIC_DIR = path.join(__dirname, '../public');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/semp', sempRouter);

app.use(express.static(STATIC_DIR));
// SPA fallback for any other GET - the app has no client-side routes today,
// but this is the standard, cheap way to keep a direct reload of any future
// route working instead of a bare 404.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(STATIC_DIR, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`[feed-viz-server] listening on http://localhost:${PORT}`);
});
