import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOrdersService } from './orders.service';

/**
 * CSV exports for the admin panel (M16, M5).
 *
 * There was no way to get anything out of this system — an admin
 * reconciling payouts against a bank statement, or an accountant asking
 * for a quarter's orders, had a web table and nothing else.
 *
 * **Rows are escaped, and formulas are neutralised.** A field beginning
 * `=`, `+`, `-`, `@`, tab or CR is treated as a formula by Excel, Sheets
 * and LibreOffice, which means a HomeKrafter naming their shop
 * `=cmd|'/c calc'!A1` gets it executed on the machine of whoever opens
 * the export. Every value here is quoted, and any leading formula
 * character is prefixed with a single quote — the standard mitigation,
 * applied at the one place every export passes through so it cannot be
 * forgotten per-column.
 */

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const guarded = FORMULA_PREFIXES.some((p) => raw.startsWith(p)) ? `'${raw}` : raw;
  // Doubling the quote is the CSV escape; wrapping everything means
  // commas and newlines inside a field need no special case.
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  // CRLF, because that is what the spec says and what Excel expects.
  return `${lines.join('\r\n')}\r\n`;
}

/** The closed set of exports, as a value so the route can validate against it and the 400 can name them. */
export const EXPORT_KINDS = ['orders', 'sellers', 'payouts'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

@Injectable()
export class AdminExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: AdminOrdersService,
  ) {}

  async build(kind: ExportKind, days?: number): Promise<{ filename: string; csv: string }> {
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
    const stamp = new Date().toISOString().slice(0, 10);

    switch (kind) {
      case 'orders':
        return { filename: `homekrafted-orders-${stamp}.csv`, csv: await this.orders(since) };
      case 'sellers':
        return { filename: `homekrafted-homekrafters-${stamp}.csv`, csv: await this.sellers() };
      case 'payouts':
        return { filename: `homekrafted-payouts-${stamp}.csv`, csv: await this.payouts(since) };
      default:
        // `kind` is typed as `ExportKind`, but it arrives as a raw route
        // param — TypeScript cannot stop `/admin/exports/anything`. Without
        // this the switch fell through returning `undefined`, the caller
        // destructured `{ filename }` off it, and the admin got a 500
        // reading "Cannot destructure property 'filename' of '(intermediate
        // value)' as it is undefined." A typo in a URL is a 400.
        throw new BadRequestException(
          `Unknown export kind "${kind}". Expected one of: ${EXPORT_KINDS.join(', ')}.`,
        );
    }
  }

  /** Every module's orders in one sheet — the unified view `/admin/orders` already shows. */
  private async orders(since?: Date): Promise<string> {
    const all = await this.ordersService.listUnified();
    const rows = all
      .filter((o) => !since || new Date(o.placedAt) >= since)
      .map((o) => [o.id, o.type, o.status, o.customerName, o.placedAt, o.total]);
    return toCsv(
      ['Order ID', 'Module', 'Status', 'Customer', 'Placed at', 'Total (INR)'],
      rows,
    );
  }

  private async sellers(): Promise<string> {
    const sellers = await this.prisma.seller.findMany({
      include: {
        vendor: { select: { name: true, slug: true, area: true, rating: true, reviewCount: true } },
        user: { select: { email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return toCsv(
      [
        'Seller ID',
        'Display name',
        'Status',
        'Specialties',
        'Storefront',
        'Area',
        'Email',
        'Phone',
        'Rating',
        'Reviews',
        'Joined',
      ],
      sellers.map((s) => [
        s.id,
        s.displayName,
        s.status,
        s.specialties.join(' / '),
        s.vendor?.slug ?? '',
        s.vendor?.area ?? '',
        s.user?.email ?? '',
        s.user?.phone ?? '',
        s.vendor ? Number(s.vendor.rating) : '',
        s.vendor?.reviewCount ?? '',
        s.createdAt,
      ]),
    );
  }

  /**
   * The one people actually asked for: settlement happens outside this
   * system, so reconciling "what we said we paid" against a bank
   * statement means getting the references out.
   */
  private async payouts(since?: Date): Promise<string> {
    const payouts = await this.prisma.payout.findMany({
      where: since ? { periodEnd: { gte: since } } : undefined,
      include: { seller: { select: { displayName: true } } },
      orderBy: { periodEnd: 'desc' },
    });
    return toCsv(
      [
        'Payout ID',
        'HomeKrafter',
        'Amount (INR)',
        'Status',
        'Period start',
        'Period end',
        'Paid at',
        'Bank reference',
        'Note',
      ],
      payouts.map((p) => [
        p.id,
        p.seller?.displayName ?? '',
        Number(p.amount),
        p.status,
        p.periodStart,
        p.periodEnd,
        p.paidAt ?? '',
        p.reference ?? '',
        p.note ?? '',
      ]),
    );
  }
}
