import { Injectable, NotFoundException } from '@nestjs/common';
import { AttributeRequirement, Prisma, ProductKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLICLY_LISTED } from './moderation';
import { AttributeSpec, inheritedSpecs } from './attribute-values';

/**
 * G1 — the read side of the attribute model (docs/GIFTING-REWORK.md §4–§5).
 *
 * Three questions, one place that answers them, because all three have to
 * agree or a buyer ticks a filter and gets a count that does not match the
 * grid:
 *
 * - **What does this shelf ask?** (`specsFor`) — the listing form, the
 *   server's own validation and the product specs tab all read it.
 * - **What departments are worth showing?** (`departments`) — only the ones
 *   with something live on them (D2), each with a real listing's photograph
 *   as its face.
 * - **What can this selection still be narrowed by?** (`facets`) — counts
 *   computed from rows with a `GROUP BY`, never incremented (M15).
 */
@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The questions a shelf asks — its own, plus its parent's that it does
   * not name itself (`inheritedSpecs`).
   */
  async specsFor(categoryId: string): Promise<AttributeSpec[]> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, parentId: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    const ids = [category.id, ...(category.parentId ? [category.parentId] : [])];
    const links = await this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: ids } },
      include: { attribute: { include: { options: { orderBy: { sortOrder: 'asc' } } } } },
      orderBy: { sortOrder: 'asc' },
    });

    const toSpec = (link: (typeof links)[number]): AttributeSpec => ({
      key: link.attribute.key,
      label: link.attribute.label,
      kind: link.attribute.kind,
      requirement: link.requirement,
      trustSensitive: link.attribute.trustSensitive,
      material: link.attribute.material,
      optionValues: link.attribute.options.map((option) => option.value),
    });

    return inheritedSpecs(
      links.filter((link) => link.categoryId === category.id).map(toSpec),
      links.filter((link) => link.categoryId !== category.id).map(toSpec),
    );
  }

  /**
   * The same thing a form needs to *draw* the questions, rather than only
   * validate them — labels, help text, options and their swatches.
   *
   * `trustSensitive` rides along on purpose: the form marks those questions
   * as the maker's own declaration, and a later suggestion is forbidden
   * from prefilling them (§8.2). A flag the client cannot see is a rule the
   * client cannot honour.
   */
  async listingSchema(categoryId: string) {
    const specs = await this.specsFor(categoryId);
    const attributes = await this.prisma.attributeDefinition.findMany({
      where: { key: { in: specs.map((spec) => spec.key) } },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    const byKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));

    return {
      categoryId,
      questions: specs.map((spec) => {
        const attribute = byKey.get(spec.key)!;
        return {
          key: spec.key,
          label: spec.label,
          helpText: attribute.helpText,
          kind: spec.kind,
          unit: attribute.unit,
          requirement: spec.requirement,
          trustSensitive: spec.trustSensitive,
          /** Editing this answer re-queues a live listing (M22). */
          material: spec.material,
          options: attribute.options.map((option) => ({
            value: option.value,
            label: option.label,
            hex: option.hex,
          })),
        };
      }),
    };
  }

  /**
   * Departments for the buyer's browse page.
   *
   * **A department with nothing live on it is not returned** (D2): with 86
   * gifts, 18 of 26 tiles were dimmed and disabled, so the dimmed ones were
   * most of the control. The pickers a maker and an admin use still list
   * every shelf — this is the buyer's view alone.
   *
   * The tile's face is **a real listing's photograph**, the highest-ranked
   * publicly listed one on that department, never stock or generated
   * imagery (the standing rule). A department whose listings carry no photo
   * yet returns `null` and the client draws the labelled placeholder, which
   * looks like a missing asset because it is one.
   */
  async departments(kind: ProductKind = ProductKind.craft) {
    const shelves = await this.prisma.category.findMany({
      where: { group: kind, parentId: null, archivedAt: null, mergedIntoId: null },
      include: {
        children: {
          where: { archivedAt: null, mergedIntoId: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const live: Prisma.ProductWhereInput = { ...PUBLICLY_LISTED, isAvailable: true };

    return (
      await Promise.all(
        shelves.map(async (shelf) => {
          const shelfIds = [shelf.id, ...shelf.children.map((child) => child.id)];
          // A listing counts for the department it is filed under *or* one
          // of its children — the M58 rule that a parent matches its
          // children, which the browse page had never actually done.
          const scope: Prisma.ProductWhereInput = {
            ...live,
            categories: { some: { categoryId: { in: shelfIds } } },
          };

          const [count, faceProduct, childCounts] = await Promise.all([
            this.prisma.product.count({ where: scope }),
            this.prisma.product.findFirst({
              where: { ...scope, images: { some: { src: { not: null } } } },
              orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }, { createdAt: 'desc' }],
              select: { images: { where: { src: { not: null } }, take: 1, orderBy: { sortOrder: 'asc' } } },
            }),
            this.prisma.productCategory.groupBy({
              by: ['categoryId'],
              where: { categoryId: { in: shelfIds }, product: { is: live } },
              _count: { _all: true },
            }),
          ]);

          const countFor = (id: string) =>
            childCounts.find((row) => row.categoryId === id)?._count._all ?? 0;

          return {
            id: shelf.id,
            slug: shelf.slug,
            name: shelf.name,
            description: shelf.description,
            icon: shelf.icon,
            count,
            imageSrc: faceProduct?.images[0]?.src ?? shelf.imageSrc ?? null,
            children: shelf.children
              .map((child) => ({
                id: child.id,
                slug: child.slug,
                name: child.name,
                icon: child.icon,
                count: countFor(child.id),
              }))
              // Same rule one level down: an empty subcategory chip is a
              // control that cannot do anything.
              .filter((child) => child.count > 0),
          };
        }),
      )
    ).filter((department) => department.count > 0);
  }

  /**
   * How many listings in the current selection carry each attribute option.
   *
   * Counted with a `GROUP BY` over `ProductAttributeValue`, which is the
   * reason the model is rows rather than a JSONB blob. **Never
   * incremented** — the M15 aggregate rule, which a denormalised counter
   * breaks the first time a listing is hidden.
   *
   * A facet is only offered once **at least half** the listings in view have
   * answered it, and the response says how many have not, so the sheet can
   * say "12 listings haven't said". A filter most of the catalogue cannot
   * answer hides more than it finds, and a buyer cannot tell the difference
   * between "none match" and "nobody was asked".
   */
  async facets(where: Prisma.ProductWhereInput) {
    const inView = await this.prisma.product.findMany({ where, select: { id: true } });
    const productIds = inView.map((product) => product.id);
    if (productIds.length === 0) return { total: 0, facets: [] };

    const [grouped, definitions, answeredPerAttribute] = await Promise.all([
      this.prisma.productAttributeValue.groupBy({
        by: ['attributeId', 'optionId'],
        where: { productId: { in: productIds }, optionId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.attributeDefinition.findMany({
        where: { filterable: true },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.productAttributeValue.findMany({
        where: { productId: { in: productIds } },
        select: { attributeId: true, productId: true },
        distinct: ['attributeId', 'productId'],
      }),
    ]);

    const answeredCount = new Map<string, number>();
    for (const row of answeredPerAttribute) {
      answeredCount.set(row.attributeId, (answeredCount.get(row.attributeId) ?? 0) + 1);
    }

    const facets = definitions
      .map((definition) => {
        const answered = answeredCount.get(definition.id) ?? 0;
        return {
          key: definition.key,
          label: definition.label,
          kind: definition.kind,
          unit: definition.unit,
          /** How many listings in view have not answered this at all. */
          unanswered: productIds.length - answered,
          answered,
          options: definition.options
            .map((option) => ({
              value: option.value,
              label: option.label,
              hex: option.hex,
              count:
                grouped.find((row) => row.optionId === option.id)?._count._all ?? 0,
            }))
            // An option nothing in view carries is not a choice; on the
            // gifts page an empty control is removed rather than dimmed (D2).
            .filter((option) => option.count > 0),
        };
      })
      .filter((facet) => facet.answered * 2 >= productIds.length && facet.options.length > 0);

    return { total: productIds.length, facets };
  }

  /**
   * Which of a shelf's questions a listing has actually answered, as the
   * product page's specs read them. Absent keys are absent on purpose —
   * nothing here turns "not answered" into "no".
   */
  async valuesFor(productId: string) {
    const rows = await this.prisma.productAttributeValue.findMany({
      where: { productId },
      include: { attribute: true, option: true },
    });

    return rows.map((row) => ({
      key: row.attribute.key,
      label: row.attribute.label,
      unit: row.attribute.unit,
      trustSensitive: row.attribute.trustSensitive,
      optionValue: row.option?.value ?? null,
      optionLabel: row.option?.label ?? null,
      text: row.text,
      number: row.number === null ? null : Number(row.number),
      boolean: row.boolean,
    }));
  }

  /** Whether a shelf requires an answer to a question, for a form's nag. */
  isRequired(spec: AttributeSpec): boolean {
    return spec.requirement === AttributeRequirement.required;
  }
}
