import { CART_OTHER_MAKER, otherMakerConflict } from '../../src/cart/one-maker-cart';

/**
 * The refusal a client acts on. It is the whole contract between the
 * server's rule and the "empty my basket and start again" choice the
 * shopper is offered, so the shape is pinned rather than assumed.
 */
describe('one basket, one maker', () => {
  it('carries a code a client can branch on', () => {
    const conflict = otherMakerConflict('vd3', 'Sharma Kitchen');
    expect(conflict.code).toBe(CART_OTHER_MAKER);
    expect(conflict.vendorId).toBe('vd3');
    expect(conflict.vendorName).toBe('Sharma Kitchen');
  });

  it('names the maker already in the basket, because the code alone is not a sentence', () => {
    // "You already have items from another maker" is not actionable; a
    // client that does not know the code shows this message as-is.
    const { message } = otherMakerConflict('vd3', 'Sharma Kitchen');
    expect(message).toContain('Sharma Kitchen');
    expect(message).not.toContain('vd3');
    expect(message).not.toContain('vendorId');
  });

  it('says the way out, not only the problem', () => {
    const { message } = otherMakerConflict('vd3', 'Sharma Kitchen');
    expect(message.toLowerCase()).toContain('empty your basket');
  });
});
