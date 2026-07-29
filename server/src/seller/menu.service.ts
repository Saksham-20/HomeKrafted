import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { mapSnack } from '../snacks/snacks.mapper';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Snack seller menu CRUD — every method scopes to `Snack.sellerId === sellerId`; a snack id belonging to another seller 404s. */
@Injectable()
export class SellerMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async list(sellerId: string) {
    const snacks = await this.prisma.snack.findMany({ where: { sellerId }, orderBy: { name: 'asc' } });
    return snacks.map(mapSnack);
  }

  async getOne(sellerId: string, snackId: string) {
    const snack = await this.assertOwned(sellerId, snackId);
    return mapSnack(snack);
  }

  async create(sellerId: string, dto: CreateMenuItemDto) {
    const slug = await this.uniqueSlug(dto.name);
    const created = await this.prisma.snack.create({
      data: {
        slug,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        category: dto.category,
        diet: dto.diet === 'non-veg' ? 'non_veg' : 'veg',
        imagePlaceholder: `${dto.name} photo`,
        imageSrc: dto.imagePath || undefined,
        available: dto.available,
        sellerId,
      },
    });
    return mapSnack(created);
  }

  async update(sellerId: string, snackId: string, dto: UpdateMenuItemDto) {
    await this.assertOwned(sellerId, snackId);
    const updated = await this.prisma.snack.update({
      where: { id: snackId },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        category: dto.category,
        diet: dto.diet ? (dto.diet === 'non-veg' ? 'non_veg' : 'veg') : undefined,
        imageSrc: dto.imagePath,
        available: dto.available,
      },
    });
    return mapSnack(updated);
  }

  /** Same one-tap availability switch as listings, over a `Snack`. */
  async setAvailability(sellerId: string, snackId: string, isAvailable: boolean) {
    await this.assertOwned(sellerId, snackId);
    const updated = await this.prisma.snack.update({
      where: { id: snackId },
      data: { available: isAvailable },
    });
    return mapSnack(updated);
  }

  async remove(sellerId: string, snackId: string): Promise<void> {
    await this.assertOwned(sellerId, snackId);
    try {
      await this.prisma.snack.delete({ where: { id: snackId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete a menu item that has existing snack-list or order references — mark it unavailable instead',
        );
      }
      throw err;
    }
  }

  private async assertOwned(sellerId: string, snackId: string) {
    const snack = await this.prisma.snack.findUnique({ where: { id: snackId } });
    if (!snack || snack.sellerId !== sellerId) {
      throw new NotFoundException('Menu item not found');
    }
    return snack;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
      const exists = await this.prisma.snack.findUnique({ where: { slug: candidate } });
      if (!exists) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}
