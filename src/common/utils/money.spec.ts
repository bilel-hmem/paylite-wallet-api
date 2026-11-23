import { bigintTransformer, formatMillimes } from './money';

describe('formatMillimes', () => {
  it.each([
    [0, '0.000 TND'],
    [5, '0.005 TND'],
    [12_500, '12.500 TND'],
    [2_000_000, '2000.000 TND'],
    [-1_250, '-1.250 TND'],
  ])('formats %i millimes as %s', (millimes, expected) => {
    expect(formatMillimes(millimes)).toBe(expected);
  });
});

describe('bigintTransformer', () => {
  it('turns the string MySQL returns for BIGINT into a number', () => {
    expect(bigintTransformer.from('125000')).toBe(125_000);
  });

  it('keeps null as null', () => {
    expect(bigintTransformer.from(null)).toBeNull();
  });
});
