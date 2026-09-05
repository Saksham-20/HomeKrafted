import { BadRequestException } from '@nestjs/common';
import { DietaryTag as PrismaDietaryTag } from '@prisma/client';

/**
 * `DietaryTag`'s Prisma enum members are declared without hyphens
 * (`gluten_free`, not `gluten-free`) because Prisma enum identifiers can't
 * contain one — the `@map(...)` in `schema.prisma` only renames the
 * underlying DB value, not the identifier the generated Prisma Client
 * actually returns at runtime (it always returns the enum's declared
 * member name). The frontend contract (`client/lib/types/marketplace.ts`'s
 * `DietaryTag`) uses the hyphenated form, so every value crossing the API
 * boundary in either direction goes through this pair of maps.
 */
const TO_FRONTEND: Record<PrismaDietaryTag, string> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  non_vegetarian: 'non-vegetarian',
  contains_egg: 'contains-egg',
  gluten_free: 'gluten-free',
  sugar_free: 'sugar-free',
  contains_nuts: 'contains-nuts',
};

const FROM_FRONTEND: Record<string, PrismaDietaryTag> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  'non-vegetarian': 'non_vegetarian',
  'contains-egg': 'contains_egg',
  'gluten-free': 'gluten_free',
  'sugar-free': 'sugar_free',
  'contains-nuts': 'contains_nuts',
};

export function dietaryTagsToFrontend(tags: PrismaDietaryTag[]): string[] {
  return tags.map((t) => TO_FRONTEND[t]);
}

export function dietaryTagsFromFrontend(tags: string[]): PrismaDietaryTag[] {
  return tags.map((t) => {
    const mapped = FROM_FRONTEND[t];
    if (!mapped) throw new BadRequestException(`Unknown dietary tag: ${t}`);
    return mapped;
  });
}
