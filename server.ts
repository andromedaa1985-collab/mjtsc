import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { createApp } from './server/app.ts';

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (process.env.NODE_ENV !== 'production' && !process.argv.includes('--production')) {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
