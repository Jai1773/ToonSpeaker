import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const isDev = process.env['NODE_ENV'] !== 'production';

/**
 * ONLY use real dist folder in production
 */
const browserDistFolder = isDev
  ? null
  : resolve(__dirname, '../browser');

const indexHtmlPath = browserDistFolder
  ? resolve(browserDistFolder, 'index.html')
  : null;

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Serve static files ONLY in production
 */
if (!isDev && browserDistFolder) {
  app.use(
    express.static(browserDistFolder, {
      maxAge: '1y',
      index: false,
      redirect: false,
    }),
  );
}

/**
 * Main handler
 */
app.use(async (req, res, next) => {
  try {
    const response = await angularApp.handle(req);

    if (response) {
      writeResponseToNodeResponse(response, res);
      return;
    }

    /**
     * Fallback ONLY in production
     */
    if (!isDev && indexHtmlPath && fs.existsSync(indexHtmlPath)) {
      res.sendFile(indexHtmlPath);
    } else {
      res.status(404).send('Page not found');
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Start server
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;

  app.listen(port, (error) => {
    if (error) throw error;

    console.log(`Server running at http://localhost:${port}`);
    console.log('Mode:', isDev ? 'DEV (Vite)' : 'PRODUCTION');
  });
}

export const reqHandler = createNodeRequestHandler(app);
