import { Snack } from '@prisma/client';

export function mapSnack(snack: Snack) {
  return {
    id: snack.id,
    slug: snack.slug,
    name: snack.name,
    description: snack.description,
    price: Number(snack.price),
    category: snack.category,
    diet: snack.diet === 'non_veg' ? 'non-veg' : 'veg',
    imagePlaceholder: snack.imagePlaceholder,
    imageSrc: snack.imageSrc ?? undefined,
    available: snack.available,
    sellerId: snack.sellerId ?? undefined,
  };
}
