import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaxonomyKind, TaxonomySuggestionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogService } from './audit-log.service';
import { NotificationsDeliveryService } from '../notifications/notifications-delivery.service';
import { CreateTaxonomySuggestionDto } from './dto/create-taxonomy-suggestion.dto';
import {
  ApproveTaxonomySuggestionDto,
  RejectTaxonomySuggestionDto,
} from './dto/decide-taxonomy-suggestion.dto';
import { mapTaxonomySuggestion } from './taxonomy-suggestion.mapper';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** The letter in the ring on an occasion tile — same rule as `AdminCollectionsService`. */
function initialOf(name: string): string {
  const match = name.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? name.charAt(0)).toUpperCase();
}

/** Collapse runs of whitespace so " Diwali  Special " and "Diwali Special" collide. */
function tidy(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

const INCLUDE = {
  vendor: { select: { id: true, name: true } },
  suggestedBy: { select: { id: true, name: true } },
} satisfies Prisma.TaxonomySuggestionInclude;

/**
 * Shelves and occasions people have asked for (M50).
 *
 * **The shape of this feature is the point.** A HomeKrafter could not say
 * "there is no shelf for what I make" anywhere in the product — the
 * picker's empty state read *"Ask us to add it"* and there was nobody to
 * ask. The obvious fix, letting them add one, is the thing
 * `test/unit/occasion-admin-only.spec.ts` exists to prevent: these two
 * tables are a shared vocabulary the whole catalogue browses by, and one
 * anybody can append to stops being one.
 *
 * So the ask is recorded, and **an admin mints the real row** — which is
 * also the only point at which somebody who can see the whole list is
 * looking at the name. Nothing in this service writes `Occasion`;
 * **This file lives in `src/admin/` for that reason**, not for tidiness.
 * `test/unit/occasion-admin-only.spec.ts` scans every source file outside
 * a small registry of allowed directories for a write to the `Occasion`
 * table, and `approve` is such a write. The seller-facing half is a
 * controller under `src/seller/` that calls `create`/`listMine` here and
 * touches neither table.
 */
@Injectable()
export class TaxonomySuggestionsService {
  private readonly logger = new Logger(TaxonomySuggestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
    private readonly delivery: NotificationsDeliveryService,
  ) {}

  // ---------------------------------------------------------------------
  // The person asking
  // ---------------------------------------------------------------------

  /**
   * File one ask.
   *
   * Two refusals, both of which hand back the sentence that says what to
   * do instead rather than a bare 409:
   *
   * - **It already exists.** Answering "that shelf is already there, it is
   *   called X" is more useful than accepting a duplicate an admin will
   *   silently drop, and it resolves most of these without a queue at all.
   * - **They already asked.** A second identical pending ask is not more
   *   information, and a queue that fills with repeats is a queue nobody
   *   reads. The reply names the pending one.
   */
  async create(userId: string, vendorId: string | undefined, dto: CreateTaxonomySuggestionDto) {
    const name = tidy(dto.name);
    if (!name) throw new BadRequestException('Give it a name.');

    const existing =
      dto.kind === 'category'
        ? await this.prisma.category.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
          })
        : await this.prisma.occasion.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
          });
    if (existing) {
      throw new ConflictException(
        `“${existing.name}” is already on the list — pick it rather than asking for it.`,
      );
    }

    const alreadyAsked = await this.prisma.taxonomySuggestion.findFirst({
      where: {
        kind: dto.kind as TaxonomyKind,
        status: 'pending',
        name: { equals: name, mode: 'insensitive' },
        suggestedById: userId,
      },
    });
    if (alreadyAsked) {
      throw new ConflictException(
        `You have already asked for “${alreadyAsked.name}”. We will let you know once it is looked at.`,
      );
    }

    const created = await this.prisma.taxonomySuggestion.create({
      data: {
        kind: dto.kind as TaxonomyKind,
        name,
        // Only a category has a side of the catalogue. Storing the form's
        // "something to eat / something to keep" answer rather than
        // guessing at review time is what lets an approved shelf land on
        // the right half without asking the admin a question the
        // HomeKrafter already answered.
        group: dto.kind === 'category' ? (dto.group ?? null) : null,
        note: dto.note?.trim() || null,
        suggestedById: userId,
        vendorId: vendorId ?? null,
      },
      include: INCLUDE,
    });

    return mapTaxonomySuggestion(created);
  }

  /** What this person has asked for, newest first — pending decisions included, so a rejection's reason is readable. */
  async listMine(userId: string) {
    const rows = await this.prisma.taxonomySuggestion.findMany({
      where: { suggestedById: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: INCLUDE,
    });
    return rows.map(mapTaxonomySuggestion);
  }

  // ---------------------------------------------------------------------
  // The person deciding
  // ---------------------------------------------------------------------

  /**
   * The queue. Pending first and oldest-pending first inside it: there is
   * a HomeKrafter waiting on the other end of every one, and a
   * newest-first queue is one where the first ask waits longest.
   */
  async listForAdmin(status?: TaxonomySuggestionStatus) {
    const rows = await this.prisma.taxonomySuggestion.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      include: INCLUDE,
    });
    return {
      items: rows.map(mapTaxonomySuggestion),
      pendingCount: await this.prisma.taxonomySuggestion.count({ where: { status: 'pending' } }),
    };
  }

  /**
   * Mint the real row and close the ask.
   *
   * The duplicate check runs **again here, against the final name** — the
   * admin may have renamed it, and the list may have grown since it was
   * filed. A 409 naming the existing row, never a silent de-duplication:
   * handing back the existing shelf while reporting success is how an
   * admin comes to believe a name they typed was saved (the M43 rule).
   */
  async approve(adminUserId: string, id: string, dto: ApproveTaxonomySuggestionDto) {
    const suggestion = await this.prisma.taxonomySuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(
        `This was already ${suggestion.status}. Reopening a decision is not something this screen does.`,
      );
    }

    const name = tidy(dto.name ?? suggestion.name);

    if (suggestion.kind === 'category') {
      const clash = await this.prisma.category.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (clash) {
        throw new ConflictException(
          `“${clash.name}” already exists — reject this with that as the reason instead of adding a second one.`,
        );
      }

      const [category, updated] = await this.prisma.$transaction(async (tx) => {
        const created = await tx.category.create({
          data: {
            slug: await this.uniqueSlug(tx, 'category', name),
            name,
            // The tile caption `ImageSlot` falls back to. No photograph:
            // nothing has been supplied for a shelf nobody has listed in
            // yet, and CLAUDE.md forbids inventing one.
            imagePlaceholder: name.toUpperCase(),
            group: suggestion.group ?? 'food',
          },
        });
        const row = await tx.taxonomySuggestion.update({
          where: { id },
          data: {
            status: 'approved',
            reviewedById: adminUserId,
            reviewedAt: new Date(),
            resultCategoryId: created.id,
          },
          include: INCLUDE,
        });
        return [created, row] as const;
      });

      await this.auditLog.log({
        actorId: adminUserId,
        action: 'taxonomy.suggestion.approve',
        targetType: 'Category',
        targetId: category.id,
        metadata: { suggestionId: id, name: category.name, group: category.group },
      });
      void this.tell(updated.suggestedById, 'approved', suggestion.kind, name);
      return mapTaxonomySuggestion(updated);
    }

    const clash = await this.prisma.occasion.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (clash) {
      throw new ConflictException(
        `“${clash.name}” already exists — reject this with that as the reason instead of adding a second one.`,
      );
    }

    const [occasion, updated] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.occasion.create({
        data: {
          slug: await this.uniqueSlug(tx, 'occasion', name),
          name,
          initial: initialOf(name),
          // An absolute date or nothing. `null` is "evergreen", which is
          // right for a birthday and for a festival whose date this admin
          // has not looked up yet — never an invented recurrence rule
          // (CLAUDE.md, M16).
          celebratedOn: dto.celebratedOn ? new Date(dto.celebratedOn) : null,
          tagline: dto.tagline?.trim() || null,
        },
      });
      const row = await tx.taxonomySuggestion.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedById: adminUserId,
          reviewedAt: new Date(),
          resultOccasionId: created.id,
        },
        include: INCLUDE,
      });
      return [created, row] as const;
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'taxonomy.suggestion.approve',
      targetType: 'Occasion',
      targetId: occasion.id,
      metadata: { suggestionId: id, name: occasion.name },
    });
    void this.tell(updated.suggestedById, 'approved', suggestion.kind, name);
    return mapTaxonomySuggestion(updated);
  }

  /** Refuse it, with a reason that reaches the HomeKrafter word for word (the M22 rule). */
  async reject(adminUserId: string, id: string, dto: RejectTaxonomySuggestionDto) {
    const suggestion = await this.prisma.taxonomySuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(`This was already ${suggestion.status}.`);
    }

    const updated = await this.prisma.taxonomySuggestion.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedById: adminUserId,
        reviewedAt: new Date(),
        decisionNote: dto.reason.trim(),
      },
      include: INCLUDE,
    });

    await this.auditLog.log({
      actorId: adminUserId,
      action: 'taxonomy.suggestion.reject',
      targetType: 'TaxonomySuggestion',
      targetId: id,
      // The reason is on the row and goes to the person; the audit entry
      // records that a decision was made and by whom.
      metadata: { kind: suggestion.kind, name: suggestion.name },
    });
    void this.tell(updated.suggestedById, 'rejected', suggestion.kind, suggestion.name, dto.reason);
    return mapTaxonomySuggestion(updated);
  }

  // ---------------------------------------------------------------------

  /**
   * `category` — never `promo`. This is transactional: it is about
   * something they asked for and can act on. A promo block is per-sender
   * and one marketing message costs every future order update to that
   * person (CLAUDE.md, M18).
   *
   * Swallows and logs, and every caller `void`s it: a decision must not
   * roll back because a message failed.
   */
  private async tell(
    userId: string,
    outcome: 'approved' | 'rejected',
    kind: TaxonomyKind,
    name: string,
    reason?: string,
  ): Promise<void> {
    const noun = kind === 'category' ? 'shelf' : 'occasion';
    const message =
      outcome === 'approved'
        ? {
            title: `“${name}” has been added`,
            body: `The ${noun} you asked for is on Homekrafted now. You can pick it the next time you edit a listing.`,
          }
        : {
            title: `“${name}” was not added`,
            // Verbatim. Paraphrasing it here would drop the only thing
            // telling them what to do next.
            body: reason ?? `We could not add that ${noun}.`,
          };

    try {
      await this.delivery.deliver({
        userId,
        category: 'account',
        title: message.title,
        body: message.body,
        refType: 'taxonomy-suggestion',
      });
    } catch (err) {
      this.logger.error(
        `Could not tell user ${userId} about the ${noun} “${name}”: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async uniqueSlug(
    tx: Prisma.TransactionClient,
    table: 'category' | 'occasion',
    name: string,
  ): Promise<string> {
    const base = slugify(name) || table;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const exists =
        table === 'category'
          ? await tx.category.findUnique({ where: { slug: candidate } })
          : await tx.occasion.findUnique({ where: { slug: candidate } });
      if (!exists) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}
