import { randomBytes } from 'node:crypto';

/** Human-friendly public id, e.g. TRX-20261123-9F2C41AB07. Unique index in the DB. */
export function generateReference(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `TRX-${day}-${randomBytes(5).toString('hex').toUpperCase()}`;
}
