import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductKind } from '@prisma/client';
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

  private async resolveParent(parentId: string | null | undefined) {
    if (!parentId) return null;
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('That parent category does not exist.');
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
    const clash = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        group,
        parentId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
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
