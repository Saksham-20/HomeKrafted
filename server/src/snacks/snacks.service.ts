import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListSnacksQueryDto } from './dto/list-snacks.query.dto';
import { mapSnack } from './snacks.mapper';

/**
 * Snacks menu — `@Public()` reads only (browsable per `lib/channel.ts`,
 * "Browse web: yes"). Consumer ordering is WhatsApp-only ("Cart web: no")
 * — there is deliberately no `POST /snacks/order`/`snack-list` endpoint
 * here; a `SnackList` never becomes a server-side domain entity, it just
 * formats a `wa.me` message client-side (see
 * `client/lib/types/food.ts#SnackList`'s doc comment). `SnackOrder` (the
 * seller-side record of an inbound WhatsApp order) has read endpoints
 * seamed for **M8.3b** (seller portal) — **M9** (WhatsApp Cloud API)
 * owns actually writing those rows from real inbound messages; neither
 * is built here.
 */
@Injectable()
export class SnacksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListSnacksQueryDto) {
    const snacks = await this.prisma.snack.findMany({
      where: { available: true, category: query.category },
      orderBy: { name: 'asc' },
    });
    return snacks.map(mapSnack);
  }

  async getBySlug(slug: string) {
    const snack = await this.prisma.snack.findUnique({ where: { slug } });
    if (!snack) throw new NotFoundException('Snack not found');
    return mapSnack(snack);
  }
}
