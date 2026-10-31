import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const { services } = await import('../packages/shared/src/index.ts');
if (!process.env.DATABASE_URL || !process.env.DATABASE_PASSWORD) {
  throw new Error('Set DATABASE_URL and DATABASE_PASSWORD in .env before starting development');
}
const children = services.map((name, i) => {
  const scopedUrl = new URL(process.env.DATABASE_URL);
  scopedUrl.username = `market_${name}`;
  scopedUrl.password = process.env.DATABASE_PASSWORD;
  return spawn('node', ['--import', 'tsx', 'apps/api/src/server.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SERVICE_NAME: name,
      PORT: String(4100 + i),
      LOCAL_SERVICES: 'true',
      DATABASE_URL: scopedUrl.toString(),
    },
  });
});
children.push(
  spawn('npm', ['run', 'dev', '-w', '@market/web'], { stdio: 'inherit', env: process.env }),
);
function stop() {
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children)
  child.on('exit', (code) => {
    if (code) stop();
  });
