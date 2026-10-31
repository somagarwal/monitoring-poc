import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('.local', { recursive: true });
writeFileSync(
  '.local/secrets.env',
  ['POSTGRES_PASSWORD', 'DATABASE_PASSWORD', 'INTERNAL_TOKEN']
    .map((key) => `${key}=${randomBytes(24).toString('hex')}`)
    .join('\n') + '\n',
  { mode: 0o600 },
);
