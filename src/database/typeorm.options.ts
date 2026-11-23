import { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';

type EnvGetter = (key: string) => string | number | undefined;

/**
 * Connection settings shared by the Nest app and the TypeORM CLI (data-source.ts).
 * Schema changes only ever happen through migrations: synchronize stays off.
 */
export function buildTypeOrmOptions(get: EnvGetter): MysqlConnectionOptions {
  return {
    type: 'mysql',
    host: String(get('DB_HOST') ?? 'localhost'),
    port: Number(get('DB_PORT') ?? 3306),
    username: String(get('DB_USER') ?? ''),
    password: String(get('DB_PASSWORD') ?? ''),
    database: String(get('DB_NAME') ?? ''),
    synchronize: false,
    timezone: 'Z',
    charset: 'utf8mb4_unicode_ci',
    supportBigNumbers: true,
    bigNumberStrings: true,
  };
}
