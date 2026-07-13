import { z } from 'zod';

/**
 * Treat an empty/blank form value as "not provided".
 *
 * An untouched <input> submits `''`, not `undefined`. Left alone, `''` would
 * satisfy `z.string().optional()` and be written to the column as an empty
 * string, and `z.coerce.number()` would silently turn it into 0 — a suit valued
 * at nothing. Wrap every optional field in this.
 */
export function blank<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (v === '' || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    schema.optional(),
  );
}
