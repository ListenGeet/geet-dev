// Applies supabase/migrations (twice, to prove they re-run) to an empty database, then runs every
// supabase/tests/*.sql with ON_ERROR_STOP. Connection comes from the usual PG* variables (docs/13).
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const name = `geet_test_${process.pid}_${Date.now()}`;
const base = { ...process.env, PGDATABASE: process.env.PGDATABASE_ADMIN ?? 'postgres' };

function psql(args, env = base) {
  return spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    env,
    encoding: 'utf8',
  });
}

function must(label, result) {
  if (result.status !== 0) {
    console.error(`FAIL ${label}\n${result.stdout}${result.stderr}`);
    cleanup();
    process.exit(1);
  }
  return result;
}

function cleanup() {
  psql(['-c', `drop database if exists ${name} with (force)`]);
}

if (spawnSync('psql', ['--version']).status !== 0) {
  console.error(
    'test:sql needs psql and a Postgres server (set PGHOST, PGUSER, PGPASSWORD). See docs/13.',
  );
  process.exit(1);
}

must('create database', psql(['-c', `create database ${name}`]));
const db = { ...process.env, PGDATABASE: name };

must('shim', psql(['-f', join(root, 'tests', '_shim.sql')], db));
const migrations = readdirSync(join(root, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();
for (const round of [1, 2]) {
  for (const file of migrations) {
    must(`migration ${file} (run ${round})`, psql(['-f', join(root, 'migrations', file)], db));
  }
}
console.log(`migrations: ${migrations.length} files, applied twice`);

const tests = readdirSync(join(root, 'tests'))
  .filter((f) => /^\d.*\.sql$/.test(f))
  .sort();
let notices = 0;
for (const file of tests) {
  const r = must(
    `test ${file}`,
    psql(['-f', join(root, 'tests', file)], { ...db, PGOPTIONS: '-c client_min_messages=notice' }),
  );
  const lines = (r.stderr + r.stdout).split('\n').filter((l) => l.includes('ok - '));
  notices += lines.length;
  for (const l of lines) console.log(`  ${file}: ${l.replace(/^.*NOTICE:\s*/, '')}`);
}
cleanup();
console.log(`test:sql: ${tests.length} files, ${notices} assertions passed`);
