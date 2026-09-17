import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductKind } from '@prisma/client';
import { findSameName } from '../common/fold-name';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogService } from './audit-log.service';

export interface CreateCategoryInput {
  name: string;
  group: ProductKind;
  parentId?: string | null;
  imagePlaceholder?: string;
  imageSrc?: string | null;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
  imageSrc?: string | null;
  sortOrder?: number;
  group?: ProductKind;
  /** G1 — a committed icon id from the registry (`Category.icon`). */
  icon?: string | null;
  /** G1 — one buyer-facing sentence. */
  description?: string | null;
  /** G1 — other words for this shelf; search and the suggester read them. */
  synonyms?: string[];
}

/**
 * Category writes (M58) — **admin only, and this is the only writer.**
 *
 * Same rule as occasions (M43), for the same reason: a category is a
 * shared vocabulary the whole catalogue browses by, and one anybody can
 * add to stops being one. "Pickles", "Pickle" and "Achaar" as three
 * half-empty shelves nothing can merge is the outcome. A HomeKrafter
 * *asks* through `TaxonomySuggestion` and an admin decides — which is also
 * where a name gets tidied on the way in.
 *
 * `server/test/unit/category-admin-only.spec.ts` fails the build if a
 * category create appears outside `src/admin/`.
 */
@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  /**
   * The whole tree, parents with their children nested.
   *
   * One query, assembled in memory: the table is small (tens of rows) and
   * it is read on the header of every page, so a recursive CTE or a query
   * per parent would be paying for generality nobody uses.
   */
  async tree() {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byParent = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.parentId) continue;
      const list = byParent.get(row.parentId) ?? [];
      list.push(row);
      byParent.set(row.parentId, list);
    }
    return rows
      .filter((r) => !r.parentId)
      .map((parent) => ({ ...parent, children: byParent.get(parent.id) ?? [] }));
  }

  async create(actorId: string, input: CreateCategoryInput) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('A category needs a name.');

    const parent = await this.resolveParent(input.parentId);
    // A subcategory belongs to the same half of the catalogue as its
    // parent, always. "For Her" under a food shelf is not a thing anybody
    // meant, and letting the two disagree makes the header's food/gifts
    // split render a category on the wrong side.
    const group = parent ? parent.group : input.group;

    await this.assertNameFree(name, group, parent?.id ?? null);

    const category = await this.prisma.category.create({
      data: {
        name,
        slug: await this.uniqueSlug(name),
        group,
        parentId: parent?.id ?? null,
        // Not nullable in the schema and shown wherever art is missing —
        // the label is the category's own name so the placeholder says
        // what is missing rather than "image".
        imagePlaceholder: input.imagePlaceholder?.trim() || `${name} — category tile`,
        imageSrc: input.imageSrc?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    await this.auditLog.log({
      actorId,
      action: 'category.create',
      targetType: 'Category',
      targetId: category.id,
      metadata: { name: category.name, group: category.group, parentId: category.parentId },
    });
    return category;
  }

  async update(actorId: string, id: string, input: UpdateCategoryInput) {
    const existing = await this.prisma.category.findUnique({ where: { id }, include: { children: true } });
    if (!existing) throw new NotFoundException('Category not found');

    const data: Prisma.CategoryUpdateInput = {};
    let parentId = existing.parentId;

    if (input.parentId !== undefined) {
      if (input.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent.');
      }
      // One level deep, enforced from both ends: a category that already
      // has children cannot become somebody's child, and a category
      // cannot be filed under one that is itself a child. Arbitrary
      // nesting reads as more general and produces a tree nobody can
      // browse and a breadcrumb nobody can render.
      if (input.parentId && existing.children.length) {
        throw new BadRequestException(
          `"${existing.name}" has subcategories of its own, so it cannot become a subcategory. Move its children out first.`,
        );
      }
      const parent = await this.resolveParent(input.parentId);
      parentId = parent?.id ?? null;
      data.parent = parent ? { connect: { id: parent.id } } : { disconnect: true };
      // Follow the parent's side of the catalogue — see `create`.
      if (parent) data.group = parent.group;
    }

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('A category needs a name.');
      if (name !== existing.name) {
        await this.assertNameFree(name, (data.group as ProductKind) ?? existing.group, parentId, id);
      }
      data.name = name;
      // The slug is deliberately **not** re-derived. It is in every
      // browse URL anybody has ever shared or that Google has indexed,
      // and renaming a shelf should not 404 them.
    }

    if (input.group !== undefined && !parentId) data.group = input.group;
    if (input.imageSrc !== undefined) data.imageSrc = input.imageSrc?.trim() || null;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    // G1. `icon` is a column and not a slug-to-icon map in code, which is
    // what left 17 of 26 live tiles drawing the same basket: a shelf added
    // after the map was written had no entry, and nothing failed when that
    // happened. A blank clears it back to the fallback.
    if (input.icon !== undefined) data.icon = input.icon?.trim() || null;
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.synonyms !== undefined) {
      data.synonyms = Array.from(
        new Set(input.synonyms.map((word) => word.trim()).filter((word) => word.length > 0)),
      );
    }

    const category = await this.prisma.category.update({ where: { id }, data });
    await this.auditLog.log({
      actorId,
      action: 'category.update',
      targetType: 'Category',
      targetId: id,
      metadata: { before: { name: existing.name, parentId: existing.parentId, group: existing.group }, after: input },
    });
    return category;
  }

  /**
   * Retire a shelf without deleting it (G1).
   *
   * An archived category leaves the pickers and the browse page while
   * every link, breadcrumb and order already pointing at it keeps
   * resolving. This is how M58's recipient shelves ("For Her") stop being
   * categories once recipient becomes a facet — **archived, never
   * dropped**, because the slugs are in URLs people have shared.
   *
   * Reversible on purpose: `archivedAt: null` puts it back, and nothing
   * about the listings on it changed in between.
   */
  async setArchived(actorId: string, id: string, archived: boolean) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: { children: { where: { archivedAt: null } } },
    });
    if (!existing) throw new NotFoundException('Category not found');
    if (archived && existing.children.length > 0) {
      throw new BadRequestException(
        `"${existing.name}" still has ${existing.children.length} live subcategor${existing.children.length === 1 ? 'y' : 'ies'}. Archive or move those first.`,
      );
    }

    const category = await this.prisma.category.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await this.auditLog.log({
      actorId,
      action: archived ? 'category.archive' : 'category.unarchive',
      targetType: 'Category',
      targetId: id,
      metadata: { name: existing.name },
    });
    return category;
  }

  /**
   * Fold one shelf into another (G1) — production holds both "Home Décor"
   * and "Home Decor" (§3.1), and this is how they become one.
   *
   * Three things happen, and the order matters:
   *
   * 1. Every listing on the source is filed onto the target, **skipping
   *    duplicates** — a listing already on both would violate
   *    `ProductCategory`'s unique pair.
   * 2. A listing whose *primary* category was the source gets the target
   *    as its primary, because `Product.categoryId` is the breadcrumb and
   *    the canonical URL and may not point at a retired shelf.
   * 3. The source is archived and marked `mergedIntoId`, so its old URL
   *    resolves to the target and redirects rather than 404ing (M58's rule
   *    that a slug in the wild keeps working).
   *
   * **Listings are not re-queued.** An admin tidying the shelf somebody is
   * already approved on is not a material change by that maker (M44: an
   * admin edit never re-queues), and re-queueing here would take a live
   * catalogue off sale to fix our own duplicate.
   */
  async merge(actorId: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new BadRequestException('A category cannot be merged into itself.');

    const [source, target] = await Promise.all([
      this.prisma.category.findUnique({ where: { id: sourceId }, include: { children: true } }),
      this.prisma.category.findUnique({ where: { id: targetId } }),
    ]);
    if (!source) throw new NotFoundException('The category being merged was not found.');
    if (!target) throw new NotFoundException('The category to merge into was not found.');
    if (target.archivedAt || target.mergedIntoId) {
      throw new BadRequestException(
        `"${target.name}" is retired and cannot receive a merge. Pick a live shelf instead.`,
      );
    }
    if (source.group !== target.group) {
      throw new BadRequestException(
        'Those two shelves are on different sides of the catalogue. Merging them would file food under gifts.',
      );
    }
    if (source.children.length > 0) {
      throw new BadRequestException(
        `"${source.name}" has subcategories. Move them under "${target.name}" first, so nothing is orphaned.`,
      );
    }

    const moved = await this.prisma.$transaction(async (tx) => {
      const links = await tx.productCategory.findMany({ where: { categoryId: sourceId } });
      const alreadyOnTarget = new Set(
        (
          await tx.productCategory.findMany({
            where: { categoryId: targetId, productId: { in: links.map((link) => link.productId) } },
            select: { productId: true },
          })
        ).map((link) => link.productId),
      );

      const toCreate = links.filter((link) => !alreadyOnTarget.has(link.productId));
      if (toCreate.length > 0) {
        await tx.productCategory.createMany({
          data: toCreate.map((link) => ({ productId: link.productId, categoryId: targetId })),
        });
      }
      await tx.productCategory.deleteMany({ where: { categoryId: sourceId } });
      await tx.product.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      });
      await tx.category.update({
        where: { id: sourceId },
        data: { mergedIntoId: targetId, archivedAt: new Date() },
      });
      return links.length;
    });

    await this.auditLog.log({
      actorId,
      action: 'category.merge',
      targetType: 'Category',
      targetId: sourceId,
      metadata: { source: source.name, target: target.name, listingsMoved: moved },
    });
    return { merged: true, listingsMoved: moved, into: { id: target.id, name: target.name } };
  }

  private async resolveParent(parentId: string | null | undefined) {
    if (!parentId) return null;
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('That parent category does not exist.');
    if (parent.archivedAt || parent.mergedIntoId) {
      throw new BadRequestException(
        `"${parent.name}" is retired and cannot take a new or moved subcategory.`,
      );
    }
    if (parent.parentId) {
      throw new BadRequestException(
        `"${parent.name}" is already a subcategory. Categories go one level deep, so it cannot hold subcategories of its own.`,
      );
    }
    return parent;
  }

  /**
   * A duplicate is a **409 naming the row that already exists**, never a
   * silent hand-back of it (the M43 rule) — that makes an admin believe
   * the thing they typed was saved.
   *
   * Scoped to the same parent and side of the catalogue on purpose: "Gift
   * boxes" under gifts and under food are two different shelves, and so
   * are "Sweets" under two different parents.
   */
  private async assertNameFree(name: string, group: ProductKind, parentId: string | null, exceptId?: string) {
    // Accent- and case-folded in code (`common/fold-name.ts`): "Home Décor"
    // and "Home Decor" are one name, which `mode: 'insensitive'` missed.
    const siblings = await this.prisma.category.findMany({
      where: { group, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { name: true, slug: true },
    });
    const clash = findSameName(siblings, name);
    if (clash) {
      throw new ConflictException(
        `"${clash.name}" already exists${parentId ? ' under that parent' : ''} (${clash.slug}). Use it, or pick a different name.`,
      );
    }
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'category';
    let candidate = base;
    for (let i = 2; i < 100; i += 1) {
      const taken = await this.prisma.category.findUnique({ where: { slug: candidate } });
      if (!taken) return candidate;
      candidate = `${base}-${i}`;
    }
    throw new ConflictException('Could not derive a free slug for that name.');
  }
}
