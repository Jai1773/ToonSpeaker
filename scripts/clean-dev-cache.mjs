import fs from 'node:fs/promises';
import path from 'node:path';

const roots = [
  '.angular/cache',
  '.angular/vite',
  'node_modules/.vite',
];

async function rmrf(relPath) {
  const abs = path.resolve(process.cwd(), relPath);
  try {
    await fs.rm(abs, { recursive: true, force: true });
    process.stdout.write(`Removed ${relPath}\n`);
  } catch (err) {
    process.stdout.write(`Skip ${relPath} (${err?.code ?? 'error'})\n`);
  }
}

await Promise.all(roots.map(rmrf));

