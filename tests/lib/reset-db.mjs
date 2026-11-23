// Drops and recreates the test database named in DATABASE_URL (local only).
import pg from "pg";

const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("reset-db only runs against a local database");
const name = url.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`unexpected database name: ${name}`);
const admin = new URL(url);
admin.pathname = "/postgres";

const c = new pg.Client({ connectionString: admin.toString() });
await c.connect();
await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await c.query(`CREATE DATABASE ${name}`);
await c.end();
console.log(`database ${name} reset`);
