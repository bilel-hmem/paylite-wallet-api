import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Runs once before the e2e suite: loads .env.test (CI variables win) and
 * applies the migrations to the test database, exactly like a real deploy.
 */
export default function globalSetup(): void {
  const root = resolve(__dirname, '..');
  config({ path: resolve(root, '.env.test'), quiet: true });

  if (!process.env.DB_NAME?.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests against "${process.env.DB_NAME}": the database name must end with "_test".`,
    );
  }

  execSync('npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts', {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
}
