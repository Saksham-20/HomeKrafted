import { allocateCodAmount } from '../../src/rider/cod-split';

describe('allocateCodAmount', () => {
  it('splits proportionally to subtotal, rounded to the rupee, last group absorbing the remainder', () => {
    // 300:200:100 subtotal ratio over ₹1000 -> exact thirds would be
    // 500/333.33/166.67; the first two round normally, the last takes
    // whatever is left so the total always reconciles exactly.
    const result = allocateCodAmount(
      [
        { key: 'a', subtotal: 300 },
        { key: 'b', subtotal: 200 },
        { key: 'c', subtotal: 100 },
      ],
      1000,
    );
    const total = [...result.values()].reduce((sum, v) => sum + v, 0);
    expect(total).toBe(1000);
  });

  it('one group takes the whole amount', () => {
    const result = allocateCodAmount([{ key: 'only', subtotal: 500 }], 750);
    expect(result.get('only')).toBe(750);
  });

  it('zero COD (prepaid) yields zero for every group', () => {
    const result = allocateCodAmount(
      [
        { key: 'a', subtotal: 300 },
        { key: 'b', subtotal: 200 },
      ],
      0,
    );
    expect(result.get('a')).toBe(0);
    expect(result.get('b')).toBe(0);
  });

  it('no groups at all is an empty map, not a throw', () => {
    const result = allocateCodAmount([], 500);
    expect(result.size).toBe(0);
  });

  it('a zero-subtotal basis hands the whole amount to the last group rather than losing it to rounding', () => {
    const result = allocateCodAmount(
      [
        { key: 'a', subtotal: 0 },
        { key: 'b', subtotal: 0 },
      ],
      400,
    );
    expect(result.get('a')).toBe(0);
    expect(result.get('b')).toBe(400);
  });

  it('an even split reconciles exactly with no remainder to absorb', () => {
    const result = allocateCodAmount(
      [
        { key: 'a', subtotal: 100 },
        { key: 'b', subtotal: 100 },
      ],
      200,
    );
    expect(result.get('a')).toBe(100);
    expect(result.get('b')).toBe(100);
  });
});
