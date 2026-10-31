import pg from 'pg';
import { services } from '../packages/shared/src/index.js';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required (database administrator connection)');
const password = process.env.DATABASE_PASSWORD;
if (!password || password.length < 16)
  throw new Error('DATABASE_PASSWORD must be at least 16 characters');
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  for (const name of services) {
    const role = `market_${name}`;
    // Identifiers come only from the compile-time service list. Quote password as SQL literal.
    const secret = "'" + password.replaceAll("'", "''") + "'";
    const exists = await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (!exists.rowCount) await db.query(`CREATE ROLE ${role} LOGIN PASSWORD ${secret}`);
    else await db.query(`ALTER ROLE ${role} PASSWORD ${secret}`);
    await db.query(`CREATE SCHEMA IF NOT EXISTS ${name} AUTHORIZATION ${role}`);
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${name}.records(collection text NOT NULL,id text NOT NULL,value jsonb NOT NULL,PRIMARY KEY(collection,id))`,
    );
    await db.query(`ALTER TABLE ${name}.records OWNER TO ${role}`);
    await db.query(`REVOKE ALL ON SCHEMA ${name} FROM PUBLIC`);
  }
  await db.query('COMMIT');
  console.log('All 20 service schemas migrated');
} catch (e) {
  await db.query('ROLLBACK');
  throw e;
} finally {
  await db.end();
}
