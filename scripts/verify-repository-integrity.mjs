import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const manifestPath = path.join(root, 'REPOSITORY_BASELINE.json');

function fail(message) {
  console.error(`\nINTEGRITY CHECK FAILED: ${message}\n`);
  process.exitCode = 1;
}

if (!fs.existsSync(manifestPath)) {
  fail('REPOSITORY_BASELINE.json is missing.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const relativePath of manifest.required_files ?? []) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`Required file is missing: ${relativePath}`);
  }
}

for (const [relativePath, expectedHash] of Object.entries(manifest.protected_file_hashes ?? {})) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Protected file is missing: ${relativePath}`);
    continue;
  }

  const actualHash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(absolutePath))
    .digest('hex');

  if (actualHash !== expectedHash) {
    fail(`Protected file changed: ${relativePath}`);
  }
}

const supabasePath = path.join(root, 'src/lib/supabase.ts');
if (fs.existsSync(supabasePath)) {
  const source = fs.readFileSync(supabasePath, 'utf8');
  const forbidden = [
    'import.meta.env.VITE_SUPABASE_URL',
    'import.meta.env.VITE_SUPABASE_ANON_KEY',
    'configuration-required.supabase.co',
    "key || 'configuration-required'",
  ];

  for (const pattern of forbidden) {
    if (source.includes(pattern)) {
      fail(`src/lib/supabase.ts contains forbidden fallback/configuration code: ${pattern}`);
    }
  }

  const required = [
    'https://ixqprtabkyurqlqskjxi.supabase.co',
    'export const isSupabaseConfigured = true',
  ];

  for (const pattern of required) {
    if (!source.includes(pattern)) {
      fail(`src/lib/supabase.ts is missing required content: ${pattern}`);
    }
  }
}

const migrationDir = path.join(root, 'supabase/migrations');
if (fs.existsSync(migrationDir)) {
  const numbers = fs
    .readdirSync(migrationDir)
    .map((name) => Number.parseInt(name.match(/^(\d+)_/)?.[1] ?? '', 10))
    .filter(Number.isFinite);

  const highest = numbers.length ? Math.max(...numbers) : 0;
  const minimum = Number(manifest.rules?.minimum_migration_number ?? 0);
  if (highest < minimum) {
    fail(`Migration history regressed. Highest migration is ${highest}; minimum is ${minimum}.`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Repository integrity check passed. Protected files and baseline files are present.');
