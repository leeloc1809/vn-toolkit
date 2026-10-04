/**
 * One error type for the whole package, with a machine-readable reason.
 *
 * The reason is a closed set of strings rather than a message, because the
 * conformance suite has to compare it across two languages and a human has to
 * be able to branch on it. A message that changes with a patch release cannot
 * be either.
 */

export type VndErrorReason =
  /** No digits at all: "", "-", "   ". */
  | 'empty'
  /** A dot or comma that does not separate exactly three digits. */
  | 'has-decimal'
  /** Anything else: a letter, a second sign, two numbers. */
  | 'unexpected-character'
  /** Parsed fine, but outside 2^53-1. */
  | 'out-of-range'
  /** A whole-number argument arrived with a fractional part. */
  | 'not-integer'
  /** allocate was given an empty share list. */
  | 'empty-shares'
  /** A share was negative, fractional, or the list summed to zero. */
  | 'invalid-shares';

export class VndError extends Error {
  readonly reason: VndErrorReason;

  constructor(reason: VndErrorReason, message: string) {
    super(message);
    this.name = 'VndError';
    this.reason = reason;
  }
}

export function isVndError(value: unknown): value is VndError {
  return value instanceof VndError;
}
