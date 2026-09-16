import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttributeKind, AttributeRequirement, Prisma } from '@prisma/client';
import { findSameName } from '../common/fold-name';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuditLogService } from './audit-log.service';

/**
 * G1 — the attribute templates screen (docs/GIFTING-REWORK.md §4).
 *
 * **Admin-only, and this is the only writer**, the same rule and the same
 * reasoning as categories (M58) and occasions (M43) one layer down. A
 * category is the vocabulary a buyer browses by; an attribute is the form
 * every maker on that shelf fills in, so a seller who could add one would
 * be writing questions onto other people's screens. The drift is worse
 * too: "Metal", "metal type" and "Base material" as three filters
 * splitting one facet, each with a count that is quietly wrong.
 *
 * `server/test/unit/attribute-admin-only.spec.ts` fails the build if a
 * definition, option or shelf link is written outside `src/admin/`.
 *
 * The point of the screen is that **adding a question needs no deploy**.
 * Until G1, "what the form asks" was a hardcoded map in the client that
 * had already drifted from the database.
 */
@Injectable()
export class AdminAttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  /** Every question, with its options and the shelves that ask it. */
  async list() {
    const definitions = await this.prisma.attributeDefinition.findMany({
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    return definitions.map((definition) => ({
      id: definition.id,
      key: definition.key,
      label: definition.label,
      helpText: definition.helpText,
      kind: definition.kind,
      unit: definition.unit,
      filterable: definition.filterable,
      trustSensitive: definition.trustSensitive,
      material: definition.material,
      options: definition.options.map((option) => ({
        id: option.id,
        value: option.value,
        label: option.label,
        hex: option.hex,
        synonyms: option.synonyms,
      })),
      shelves: definition.categories.map((link) => ({
        categoryId: link.categoryId,
        name: link.category.name,
        requirement: link.requirement,
      })),
    }));
  }

  async create(
    actorId: string,
    input: {
      key: string;
      label: string;
      kind: AttributeKind;
      helpText?: string;
      unit?: string;
      filterable?: boolean;
      trustSensitive?: boolean;
      material?: boolean;
    },
  ) {
    const key = input.key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) {
      throw new BadRequestException(
        'A key is lower-case letters, numbers and underscores — it is what a saved answer and a shared filter URL both point at.',
      );
    }
    const clash = await this.prisma.attributeDefinition.findUnique({ where: { key } });
    // Named, never silently handed back (the M43 rule): returning the
    // existing row makes an admin believe the label and options they typed
    // were saved onto it.
    if (clash) throw new ConflictException(`"${clash.label}" already uses the key "${key}".`);

    const definition = await this.prisma.attributeDefinition.create({
      data: {
        key,
        label: input.label.trim(),
        helpText: input.helpText?.trim() || null,
        kind: input.kind,
        unit: input.unit?.trim() || null,
        filterable: input.filterable ?? false,
        trustSensitive: input.trustSensitive ?? false,
        material: input.material ?? false,
      },
    });
    await this.auditLog.log({
      actorId,
      action: 'attribute.create',
      targetType: 'AttributeDefinition',
      targetId: definition.id,
      metadata: { key, label: definition.label, kind: definition.kind },
    });
    return definition;
  }

  /**
   * Edit a question. **`key` is absent on purpose** — it is what every
   * stored answer and every shared filter URL points at, the same contract
   * as a category slug (M58). Rename the `label`.
   */
  async update(
    actorId: string,
    id: string,
    input: {
      label?: string;
      helpText?: string | null;
      unit?: string | null;
      filterable?: boolean;
      trustSensitive?: boolean;
      material?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.attributeDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Attribute not found');

    const data: Prisma.AttributeDefinitionUpdateInput = {};
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) throw new BadRequestException('A question needs a label.');
      data.label = label;
    }
    if (input.helpText !== undefined) data.helpText = input.helpText?.trim() || null;
    if (input.unit !== undefined) data.unit = input.unit?.trim() || null;
    if (input.filterable !== undefined) data.filterable = input.filterable;
    if (input.trustSensitive !== undefined) data.trustSensitive = input.trustSensitive;
    if (input.material !== undefined) data.material = input.material;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    const definition = await this.prisma.attributeDefinition.update({ where: { id }, data });
    await this.auditLog.log({
      actorId,
      action: 'attribute.update',
      targetType: 'AttributeDefinition',
      targetId: id,
      metadata: { before: { label: existing.label, trustSensitive: existing.trustSensitive }, after: input },
    });
    return definition;
  }

  /**
   * Add an allowed answer.
   *
   * `value` is the stable machine string and is never renamed; `label` is
   * what a buyer reads and may be. A duplicate is a **409 naming the
   * existing option** rather than a silent hand-back, so an admin is never
   * told their new label was saved onto somebody else's row.
   */
  async addOption(
    actorId: string,
    attributeId: string,
    input: { value: string; label: string; hex?: string; synonyms?: string[] },
  ) {
    const definition = await this.prisma.attributeDefinition.findUnique({
      where: { id: attributeId },
      include: { options: true },
    });
    if (!definition) throw new NotFoundException('Attribute not found');

    const value = input.value.trim().toLowerCase().replace(/\s+/g, '_');
    if (!value) throw new BadRequestException('An option needs a value.');

    const byValue = definition.options.find((option) => option.value === value);
    if (byValue) throw new ConflictException(`"${byValue.label}" already uses the value "${value}".`);
    // Case- and accent-folded, like every other name check since 2026-09-16
    // — `mode: 'insensitive'` folds case and not accents, which is how
    // production ended up with two Home Décor shelves.
    // `findSameName` compares a `name`; an option's is its label.
    const byLabel = findSameName(
      definition.options.map((option) => ({ ...option, name: option.label })),
      input.label,
    );
    if (byLabel) throw new ConflictException(`"${byLabel.label}" is already an option here.`);

    const option = await this.prisma.attributeOption.create({
      data: {
        attributeId,
        value,
        label: input.label.trim(),
        hex: input.hex?.trim() || null,
        synonyms: (input.synonyms ?? []).map((word) => word.trim()).filter(Boolean),
        sortOrder: definition.options.length + 1,
      },
    });
    await this.auditLog.log({
      actorId,
      action: 'attribute.option.create',
      targetType: 'AttributeOption',
      targetId: option.id,
      metadata: { attribute: definition.key, value, label: option.label },
    });
    return option;
  }

  /**
   * Ask this question on this shelf, or stop asking it.
   *
   * A child inherits its parent's questions (`inheritedSpecs`), so linking
   * a department reaches every subcategory under it — which is what an
   * admin editing a department expects, and why the rows are not copied
   * down.
   */
  async setShelfQuestion(
    actorId: string,
    categoryId: string,
    attributeId: string,
    requirement: AttributeRequirement | null,
  ) {
    const [category, attribute] = await Promise.all([
      this.prisma.category.findUnique({ where: { id: categoryId } }),
      this.prisma.attributeDefinition.findUnique({ where: { id: attributeId } }),
    ]);
    if (!category) throw new NotFoundException('Category not found');
    if (!attribute) throw new NotFoundException('Attribute not found');

    if (requirement === null) {
      await this.prisma.categoryAttribute.deleteMany({ where: { categoryId, attributeId } });
      await this.auditLog.log({
        actorId,
        action: 'attribute.unlink',
        targetType: 'Category',
        targetId: categoryId,
        metadata: { attribute: attribute.key, category: category.name },
      });
      // The listings' existing answers are deliberately left in place. A
      // shelf that stops asking a question has not made the answers wrong,
      // and deleting them would lose data an admin can put back by
      // re-linking — the archive-don't-delete rule again.
      return { linked: false };
    }

    await this.prisma.categoryAttribute.upsert({
      where: { categoryId_attributeId: { categoryId, attributeId } },
      create: { categoryId, attributeId, requirement },
      update: { requirement },
    });
    await this.auditLog.log({
      actorId,
      action: 'attribute.link',
      targetType: 'Category',
      targetId: categoryId,
      metadata: { attribute: attribute.key, category: category.name, requirement },
    });
    return { linked: true, requirement };
  }
}
