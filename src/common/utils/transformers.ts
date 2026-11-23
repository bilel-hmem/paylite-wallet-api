import { TransformFnParams } from 'class-transformer';

export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Emails are compared case-insensitively, so they are normalised on the way in. */
export const trimLower = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
