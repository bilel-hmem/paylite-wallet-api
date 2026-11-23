import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from './typeorm.options';

// Used by the TypeORM CLI (migration:generate / run / revert).
// Variables already set in the environment (CI, e2e setup) take precedence over .env.
config({ quiet: true });

export default new DataSource({
  ...buildTypeOrmOptions((key) => process.env[key]),
  entities: [`${__dirname}/../modules/**/*.entity.{ts,js}`],
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
});
