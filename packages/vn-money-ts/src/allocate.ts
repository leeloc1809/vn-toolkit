import { MAX_SAFE_AMOUNT } from './constants.js';
import { VndError } from './errors.js';

/**
 * Split an amount between shares without creating or losing a single dong.
 *
 * Largest-remainder apportionment: every share gets floor(total * share / sum),
 * and the dong that are left over go to the largest remainders, earliest share
 * first when two tie. The tie-break is not a nicety. "Round half up, in order"
 * and "round half up, in whatever order the sort happened to produce" give
 * different answers, and only the first one is reproducible.
 *
 * The arithmetic runs on big integers. A million split three ways overflows
 * nothing in JavaScript but a billion split into seven does, and a money
 * library that overflows is a money library that is wrong.
 *
 * A zero share is nobody, not an error: [0, 0, 1] is a filtered list, and
 * refusing it would break the caller rather than the input.
 *
 * Throws VndError('not-integer' | 'empty-shares' | 'invalid-shares').
 */
export function allocate(total: number, shares: readonly number[]): number[] {
  if (typeof total !== 'number' || !Number.isSafeInteger(total)) {
    throw new VndError('not-integer', `${String(total)} is not a whole amount`);
  }
  if (shares.length === 0) {
    throw new VndError('empty-shares', 'there is nobody to split between');
  }

  let sum = 0n;
  for (const share of shares) {
    if (typeof share !== 'number' || !Number.isSafeInteger(share) || share < 0) {
      throw new VndError('invalid-shares', `${String(share)} is not a non-negative whole share`);
    }
    sum += BigInt(share);
  }
  if (sum === 0n) {
    throw new VndError('invalid-shares', 'the shares add up to nothing');
  }

  const magnitude = BigInt(total < 0 ? -total : total);
  const sign = total < 0 ? -1n : 1n;

  const base: bigint[] = [];
  const remainder: bigint[] = [];
  for (const share of shares) {
    const weight = BigInt(share);
    const whole = (magnitude * weight) / sum;
    base.push(whole);
    remainder.push(magnitude * weight - whole * sum);
  }

  const out = base.map((v) => v * sign);

  // Sort the indices by remainder descending, breaking ties by index. Written
  // as an explicit comparator rather than a sort on a derived key so the order
  // cannot depend on the runtime's sort being stable.
  const order = shares.map((_, i) => i);
  order.sort((a, b) => {
    if (remainder[a] === remainder[b]) return a - b;
    return remainder[a]! < remainder[b]! ? 1 : -1;
  });

  const leftover = magnitude - base.reduce((a, b) => a + b, 0n);
  if (leftover < 0n || leftover >= BigInt(order.length)) {
    // Unreachable: leftover is the difference between the total and a sum of
    // floors of parts of it, so it is always between 0 and the share count
    // minus one. It is checked anyway, because a money library that can
    // silently lose money is worse than one that throws.
    throw new VndError('out-of-range', `${total} could not be apportioned exactly`);
  }
  for (let k = 0; k < Number(leftover); k += 1) {
    const i = order[k];
    if (i === undefined) throw new VndError('out-of-range', 'lost the remainder order');
    out[i] = (out[i] ?? 0n) + sign;
  }

  if (out.some((v) => Math.abs(Number(v)) > MAX_SAFE_AMOUNT)) {
    throw new VndError('out-of-range', 'a share came out past 2^53-1');
  }
  return out.map((v) => Number(v));
}
