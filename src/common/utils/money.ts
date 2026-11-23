import { ValueTransformer } from 'typeorm';

/** 1 TND = 1000 millimes. All amounts are stored and exchanged as integer millimes. */
export const MILLIMES_PER_DINAR = 1000;

/** 12500 -> "12.500 TND" */
export function formatMillimes(millimes: number): string {
  const sign = millimes < 0 ? '-' : '';
  const abs = Math.abs(millimes);
  const dinars = Math.floor(abs / MILLIMES_PER_DINAR);
  const rest = String(abs % MILLIMES_PER_DINAR).padStart(3, '0');
  return `${sign}${dinars}.${rest} TND`;
}

/** MySQL returns BIGINT as a string; amounts here stay far below Number.MAX_SAFE_INTEGER. */
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? value : Number(value),
};
