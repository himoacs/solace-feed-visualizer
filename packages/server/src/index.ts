import express from 'express';
import cors from 'cors';
import { sempRouter } from './semp.js';

const PORT = Number(process.env.PORT) || 4001;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/semp', sempRouter);

app.listen(PORT, () => {
  console.log(`[feed-viz-server] listening on http://localhost:${PORT}`);
});
