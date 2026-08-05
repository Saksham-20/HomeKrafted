import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { mapQuote, mapPublicQuote, QUOTE_INCLUDE } from './corporate.mapper';

/**
 * Corporate quotes — what is being offered, at what price, until when.
 *
 * `CorporateInquiryStatus` has had `quoted` in it since M7b with nothing
 * being quoted. A status dropdown is not a B2B motion.
 *
 * Two rules run through everything here:
 *
 * **The accept token is a bearer credential.** Only its SHA-256 hash is
 * stored, the same as `PasswordResetToken`. Valid, expired, revoked and
 * never-existed are indistinguishable to a prober — a caller holding a
 * stale link must not learn whether it was ever real.
 *
 * **Accepting does not create orders.** `Order.userId`, `OrderItem
 * .addressId` and `OrderShipment.addressId` are all required, and a
 * `CorporateInquiry` has no user and no address — the schema cannot
 * express a corporate order today. Writing one anyway would push an
 * uncollected five-figure amount into GMV, into the payouts queue as a
 * real debt to a home cook, and through `computeCashback` as ~5% credited
 * to an account auto-created for a stranger. Acceptance records the
 * agreement and notifies; an admin places the orders once an address and
 * payment terms exist.
 */
@Injectable()
export class CorporateQuotesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SHA-256, not argon2 — this is an exact-equality index lookup, not
   * password verification. Same reasoning as `AuthService.hashToken`.
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async listForInquiry(inquiryId: string) {
    const quotes = await this.prisma.corporateQuote.findMany({
      where: { inquiryId },
      include: QUOTE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return quotes.map(mapQuote);
  }

  async create(
    adminUserId: string,
    inquiryId: string,
    dto: {
      validUntil: string;
      notes?: string;
      taxAmount?: number;
      deliveryFee?: number;
      lines: {
        productId?: string;
        vendorId: string;
        description: string;
        quantity: number;
        unitPrice: number;
      }[];
    },
  ) {
    const inquiry = await this.prisma.corporateInquiry.findUnique({ where: { id: inquiryId } });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    if (dto.lines.length === 0) {
      throw new BadRequestException('A quote needs at least one line.');
    }

    await this.assertLinesAreFulfillable(dto.lines);

    const { subtotal, total, lines } = this.priceLines(dto);

    const quote = await this.prisma.corporateQuote.create({
      data: {
        inquiryId,
        createdById: adminUserId,
        validUntil: new Date(dto.validUntil),
        notes: dto.notes,
        subtotal,
        taxAmount: dto.taxAmount ?? 0,
        deliveryFee: dto.deliveryFee ?? 0,
        total,
        lines: { create: lines },
      },
      include: QUOTE_INCLUDE,
    });

    return mapQuote(quote);
  }

  /** Edits a draft. A quote that has been sent is not editable — see `send`. */
  async update(
    quoteId: string,
    dto: {
      validUntil?: string;
      notes?: string;
      taxAmount?: number;
      deliveryFee?: number;
      lines?: {
        productId?: string;
        vendorId: string;
        description: string;
        quantity: number;
        unitPrice: number;
      }[];
    },
  ) {
    const existing = await this.require(quoteId);
    if (existing.status !== 'draft') {
      throw new ConflictException(
        'This quote has already been sent. Withdraw it and raise a new one to change the price.',
      );
    }

    if (dto.lines) {
      if (dto.lines.length === 0) throw new BadRequestException('A quote needs at least one line.');
      await this.assertLinesAreFulfillable(dto.lines);
    }

    const source = dto.lines
      ? { ...dto, lines: dto.lines }
      : {
          ...dto,
          lines: existing.lines.map((line) => ({
            productId: line.productId ?? undefined,
            vendorId: line.vendorId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: Number(line.unitPrice),
          })),
        };
    const { subtotal, total, lines } = this.priceLines({
      lines: source.lines,
      taxAmount: dto.taxAmount ?? Number(existing.taxAmount),
      deliveryFee: dto.deliveryFee ?? Number(existing.deliveryFee),
    });

    const quote = await this.prisma.$transaction(async (tx) => {
      await tx.corporateQuoteLine.deleteMany({ where: { quoteId } });
      return tx.corporateQuote.update({
        where: { id: quoteId },
        data: {
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          notes: dto.notes,
          subtotal,
          taxAmount: dto.taxAmount ?? undefined,
          deliveryFee: dto.deliveryFee ?? undefined,
          total,
          lines: { create: lines },
        },
        include: QUOTE_INCLUDE,
      });
    });

    return mapQuote(quote);
  }

  /**
   * Mints the accept token and marks the quote sent.
   *
   * **Returns the raw token exactly once** — it is never stored and never
   * readable again, so the caller has to put it in the email now. Re-sending
   * rotates it, which invalidates the previous link: a quote forwarded
   * before a correction must not stay acceptable.
   */
  async send(quoteId: string) {
    const quote = await this.require(quoteId);
    if (quote.status === 'accepted') {
      throw new ConflictException('This quote has already been accepted.');
    }
    if (quote.validUntil <= new Date()) {
      throw new ConflictException('This quote has already expired. Extend the date before sending.');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.corporateQuote.update({
        where: { id: quoteId },
        data: {
          status: 'sent',
          tokenHash: this.hashToken(token),
          sentAt: new Date(),
          // A rotation un-revokes: the new link is live even if the old
          // one was withdrawn.
          revokedAt: null,
          declinedAt: null,
        },
        include: QUOTE_INCLUDE,
      });
      await tx.corporateInquiry.update({
        where: { id: row.inquiryId },
        data: { status: 'quoted' },
      });
      return row;
    });

    return { quote: mapQuote(updated), token };
  }

  /**
   * Kills the link without deleting the quote — the record of what was
   * offered survives.
   *
   * **Only a `sent` quote falls back to `draft`.** That is the whole point
   * of the fallback: withdrawing a live link means "nobody should be
   * looking at this number any more", and the quote becomes re-pricable so
   * it can be raised again.
   *
   * A quote somebody has already **accepted** or **declined** is a closed
   * commercial fact, and resetting it would undo three things at once: the
   * admin queue would show it as never sent, `acceptedAt`/`acceptedName`
   * would sit on a row calling itself a draft, and `reprice` — which is
   * drafts-only and answers 409 for a `sent` quote precisely so nobody
   * edits a number a customer is reading — would quietly reopen on a
   * number a customer already agreed to.
   *
   * Killing the link after acceptance is still legitimate: a forwarded
   * email should stop working once the deal is closed. It just must not
   * rewrite what happened.
   */
  async revoke(quoteId: string) {
    const existing = await this.require(quoteId);

    const quote = await this.prisma.corporateQuote.update({
      where: { id: quoteId },
      data: {
        revokedAt: new Date(),
        tokenHash: null,
        ...(existing.status === 'sent' ? { status: 'draft' as const } : {}),
      },
      include: QUOTE_INCLUDE,
    });
    return mapQuote(quote);
  }

  /**
   * The public read. **Never throws for a bad token** beyond a flat 404,
   * and 404 covers not-found *and* revoked — which is what makes probing
   * useless.
   *
   * "Already accepted" is a normal state, not an error: a procurement
   * manager clicking their emailed link a second time is the ordinary
   * case, and encoding it as an error would force clients to parse
   * message strings.
   */
  async getByToken(token: string) {
    const quote = await this.prisma.corporateQuote.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { ...QUOTE_INCLUDE, inquiry: true },
    });
    if (!quote || quote.revokedAt) throw new NotFoundException('Quote not found');

    return mapPublicQuote(quote, this.publicStatus(quote));
  }

  /**
   * Accepting.
   *
   * The claim is a **conditional `updateMany`**, not a read-then-write: a
   * forwarded link opened twice at once would otherwise have both requests
   * see `sent` and both accept. `IdempotencyService` does not help — it is
   * user-scoped, and this caller is anonymous.
   *
   * Zero rows affected means somebody already accepted, so this returns
   * the receipt rather than an error.
   */
  async accept(token: string, acceptedName: string) {
    const tokenHash = this.hashToken(token);
    const existing = await this.prisma.corporateQuote.findUnique({
      where: { tokenHash },
      include: { ...QUOTE_INCLUDE, inquiry: true },
    });
    if (!existing || existing.revokedAt) throw new NotFoundException('Quote not found');

    if (existing.validUntil <= new Date() && existing.status !== 'accepted') {
      throw new ConflictException(
        'This quote has expired. Get in touch and we will send you an updated one.',
      );
    }

    const claimed = await this.prisma.corporateQuote.updateMany({
      where: { tokenHash, status: 'sent', acceptedAt: null, validUntil: { gt: new Date() } },
      data: { status: 'accepted', acceptedAt: new Date(), acceptedName },
    });

    const quote = await this.prisma.corporateQuote.findUniqueOrThrow({
      where: { tokenHash },
      include: { ...QUOTE_INCLUDE, inquiry: true },
    });

    /*
      Decided from the row **after** the claim, never from the read above
      it. Under concurrent requests every one of them reads `sent`, one
      wins the conditional update and the rest see zero rows — judging
      from the stale read would hand those losers a 409 for the ordinary
      case they exist to handle. They lost a race nobody asked them to
      run; the quote is accepted, so they get the receipt.
    */
    if (claimed.count === 0 && quote.status !== 'accepted') {
      throw new ConflictException('This quote is not open for acceptance.');
    }

    return {
      quote: mapPublicQuote(quote, this.publicStatus(quote)),
      /** True only for the request that actually made the claim — the caller uses it to decide whether to notify. */
      justAccepted: claimed.count === 1,
    };
  }

  async decline(token: string) {
    const tokenHash = this.hashToken(token);
    const existing = await this.prisma.corporateQuote.findUnique({
      where: { tokenHash },
      include: { ...QUOTE_INCLUDE, inquiry: true },
    });
    if (!existing || existing.revokedAt) throw new NotFoundException('Quote not found');
    if (existing.status === 'accepted') {
      throw new ConflictException('This quote has already been accepted.');
    }

    const claimed = await this.prisma.corporateQuote.updateMany({
      where: { tokenHash, status: 'sent' },
      data: { status: 'declined', declinedAt: new Date() },
    });

    const quote = await this.prisma.corporateQuote.findUniqueOrThrow({
      where: { tokenHash },
      include: { ...QUOTE_INCLUDE, inquiry: true },
    });
    return {
      quote: mapPublicQuote(quote, this.publicStatus(quote)),
      justDeclined: claimed.count === 1,
    };
  }

  /**
   * `expired` is derived from the clock, never stored — nothing sweeps
   * these, so a stored flag would be wrong until something did.
   */
  private publicStatus(quote: { status: string; validUntil: Date }) {
    if (quote.status === 'accepted') return 'accepted' as const;
    if (quote.status === 'declined') return 'declined' as const;
    if (quote.validUntil <= new Date()) return 'expired' as const;
    return 'valid' as const;
  }

  private priceLines(input: {
    lines: {
      productId?: string;
      vendorId: string;
      description: string;
      quantity: number;
      unitPrice: number;
    }[];
    taxAmount?: number;
    deliveryFee?: number;
  }) {
    const lines = input.lines.map((line, index) => ({
      productId: line.productId,
      vendorId: line.vendorId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: round2(line.quantity * line.unitPrice),
      sortOrder: index,
    }));
    const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const total = round2(subtotal + (input.taxAmount ?? 0) + (input.deliveryFee ?? 0));
    return { subtotal, total, lines };
  }

  /**
   * Every line names a kitchen that exists.
   *
   * Seller order visibility, seller notifications and payouts all resolve
   * ownership through the vendor. A line nobody owns is work no kitchen
   * can see and money nobody can be paid — refused at build time rather
   * than discovered at fulfilment.
   */
  private async assertLinesAreFulfillable(
    lines: { productId?: string; vendorId: string }[],
  ): Promise<void> {
    const vendorIds = [...new Set(lines.map((line) => line.vendorId))];
    const found = await this.prisma.vendor.count({ where: { id: { in: vendorIds } } });
    if (found !== vendorIds.length) {
      throw new BadRequestException(
        'Every line has to name a HomeKrafter who can actually fulfil it.',
      );
    }

    const productIds = lines.map((l) => l.productId).filter((id): id is string => Boolean(id));
    if (productIds.length === 0) return;

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, vendorId: true, name: true },
    });
    if (products.length !== new Set(productIds).size) {
      throw new BadRequestException('One or more listings on this quote no longer exist.');
    }

    // A catalogue line filed under the wrong kitchen would pay the wrong
    // person. The listing's own vendor wins over whatever was submitted.
    const vendorByProduct = new Map(products.map((p) => [p.id, p.vendorId]));
    for (const line of lines) {
      if (!line.productId) continue;
      if (vendorByProduct.get(line.productId) !== line.vendorId) {
        const product = products.find((p) => p.id === line.productId);
        throw new BadRequestException(
          `"${product?.name ?? 'That listing'}" belongs to a different HomeKrafter than the one on this line.`,
        );
      }
    }
  }

  private async require(quoteId: string) {
    const quote = await this.prisma.corporateQuote.findUnique({
      where: { id: quoteId },
      include: QUOTE_INCLUDE,
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }
}

/** Money is stored as `Decimal`; JS arithmetic on it needs pinning to paise. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type QuoteRow = Prisma.CorporateQuoteGetPayload<{ include: typeof QUOTE_INCLUDE }>;
