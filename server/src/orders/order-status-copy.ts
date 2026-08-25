import { OrderStatus } from '@prisma/client';

export interface OrderMessage {
  title: string;
  body: string;
}

/**
 * What the buyer is told at each point in an order's life.
 *
 * Pure, and its own module rather than a private method on
 * `OrderNotificationsService`, for the same reason `vendor-discount.ts`
 * and `menu-lock.ts` are: this is the copy a customer actually reads, it
 * has rules, and rules that are not tested are rules that quietly stop
 * holding. `order-status-copy.spec.ts` pins the two below.
 *
 * **Rule 1 — `placed` and `confirmed` are different events, and must not
 * read the same.** They shared a branch until now, so both produced
 * "Order HK2114 confirmed / Your order is with the kitchen". The buyer
 * therefore got the identical message twice, seconds apart: once when
 * their payment cleared and again when the HomeKrafter actually accepted
 * the order. The second one is the one they are waiting for — it is the
 * moment a person on the other end agreed to make the thing — and it was
 * indistinguishable from the receipt. Worse, a HomeKrafter who had not
 * yet accepted anything had already had "confirmed" sent in their name.
 *
 * **Rule 2 — every line must be true of a candle as well as a curry.**
 * One pipeline has carried food and craft since M20 (`CLAUDE.md`'s
 * `kitchen-copy.ts` rule). "Freshly made and boxed up" is wrong for a
 * pair of earrings, and "your order is with the kitchen" is wrong for
 * half the catalogue. The wording is deliberately plain.
 */
export function buyerOrderMessage(status: OrderStatus, orderNumber: string): OrderMessage | null {
  switch (status) {
    // A COD order sits here, and so does a card order while the payment
    // sheet is open. What the buyer needs to hear is that the order
    // reached us; saying "confirmed" before capture would be a promise
    // the payment might not keep.
    case 'pending_payment':
      return {
        title: `We’ve got order ${orderNumber}`,
        body: 'Your order is in. We’ll confirm as soon as it is picked up.',
      };
    // Paid. Nobody has agreed to make it yet — that is the next message.
    case 'placed':
      return {
        title: `Order ${orderNumber} is in`,
        body: 'Paid, and sent to the HomeKrafter. They’ll accept it shortly and we’ll let you know.',
      };
    // A person on the other end has said yes. This is the one the buyer
    // is actually waiting for.
    case 'confirmed':
      return {
        title: `Order ${orderNumber} accepted`,
        body: 'The HomeKrafter has accepted your order and started on it. We’ll message you when it’s packed.',
      };
    case 'packed':
      return {
        title: `Order ${orderNumber} is packed`,
        body: 'Made and boxed up. It goes out for delivery next.',
      };
    case 'shipped':
      return {
        title: `Order ${orderNumber} is on the way`,
        body: 'Picked up and out for delivery now.',
      };
    case 'delivered':
      return {
        title: `Order ${orderNumber} delivered`,
        body: 'Hope it was worth the wait. You can leave a review from your orders page — the HomeKrafter reads every one.',
      };
    case 'cancelled':
      return {
        title: `Order ${orderNumber} cancelled`,
        body: 'This order has been cancelled. Anything already paid goes back to your Homekrafted wallet.',
      };
    case 'returned':
      return {
        title: `Return for order ${orderNumber} closed`,
        body: 'Your return has been processed. Check your wallet for the refund.',
      };
    default:
      return null;
  }
}
