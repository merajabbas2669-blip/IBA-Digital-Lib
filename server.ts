import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { startAbsenceScheduler } from './server/absenceManager.ts';
import { purgeExpiredSessions } from './server/auth.ts';
import { initializeSchema } from './server/db.ts';
import { apiRouter } from './server/routes.ts';
import { seedDatabaseIfEmpty } from './server/seed.ts';

dotenv.config();

// Initialize relational schema, seed data, and start reliable backend absence automation
initializeSchema();
seedDatabaseIfEmpty();
purgeExpiredSessions();
startAbsenceScheduler();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '256kb' }));

  // Explicitly allow camera access for QR desk scanning across standalone and embedded contexts
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=*');
    next();
  });

  // Mount authenticated & public API routes
  app.use('/api', apiRouter);

  // Unknown API route fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IBA Digital Library Smart ILS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
