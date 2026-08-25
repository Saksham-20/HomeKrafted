import { OrderStatus } from '@prisma/client';
import { buyerOrderMessage } from '../../src/orders/order-status-copy';

/**
 * The copy a buyer actually reads as their order moves. Both rules here
 * are ones that had already stopped holding before anybody looked.
 */
describe('buyerOrderMessage', () => {
  const N = 'HK2114';

  it('says something for every status in the pipeline', () => {
    const statuses: OrderStatus[] = [
      'pending_payment',
      'placed',
      'confirmed',
      'packed',
      'shipped',
      'delivered',
      'cancelled',
      'returned',
    ];
    for (const status of statuses) {
      expect(buyerOrderMessage(status, N)).not.toBeNull();
    }
  });

  /**
   * The defect this file exists for. `placed` and `confirmed` shared a
   * branch, so a buyer got the identical message twice seconds apart —
   * once when their payment cleared, once when a HomeKrafter actually
   * accepted the order. The second is the one they are waiting for.
   */
  it('never sends the same words for two different statuses', () => {
    const seen = new Map<string, OrderStatus>();
    const statuses: OrderStatus[] = [
      'pending_payment',
      'placed',
      'confirmed',
      'packed',
      'shipped',
      'delivered',
      'cancelled',
      'returned',
    ];
    for (const status of statuses) {
      const message = buyerOrderMessage(status, N);
      if (!message) continue;
      const key = `${message.title}|${message.body}`;
      const clash = seen.get(key);
      expect(clash).toBeUndefined();
      seen.set(key, status);
    }
  });

  it('distinguishes "we took your money" from "somebody agreed to make it"', () => {
    const placed = buyerOrderMessage('placed', N)!;
    const confirmed = buyerOrderMessage('confirmed', N)!;
    expect(placed.title).not.toEqual(confirmed.title);
    // The acceptance is the event worth naming as one.
    expect(confirmed.title.toLowerCase()).toContain('accepted');
  });

  /**
   * One pipeline has carried food and craft since M20. A status line that
   * only makes sense for something edible is wrong for half the
   * catalogue — the `kitchen-copy.ts` rule in CLAUDE.md, applied to the
   * messages that actually leave the building.
   */
  it('uses nothing that is only true of food', () => {
    const foodOnly = /\bkitchen\b|\bcook|\bfresh|\bstove\b|\bbake|\brecipe\b|\btasty\b|\bflavour/i;
    const statuses: OrderStatus[] = [
      'pending_payment',
      'placed',
      'confirmed',
      'packed',
      'shipped',
      'delivered',
      'cancelled',
      'returned',
    ];
    for (const status of statuses) {
      const message = buyerOrderMessage(status, N);
      if (!message) continue;
      expect(`${message.title} ${message.body}`).not.toMatch(foodOnly);
    }
  });

  it('names the order in the title, which is what makes two of them tellable apart', () => {
    for (const status of ['placed', 'confirmed', 'packed', 'shipped', 'delivered'] as OrderStatus[]) {
      expect(buyerOrderMessage(status, N)!.title).toContain(N);
    }
  });
});
