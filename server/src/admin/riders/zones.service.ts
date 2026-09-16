import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditLogService } from '../audit-log.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { mapZone } from './riders.mapper';

/** `DeliveryZone` CRUD (D5 — circles). The dispatch math itself (`zoneFor`) lives in `src/rider/zones.ts`, shared by the app-facing `GET /rider/zones` and (from R2) the dispatcher. */
@Injectable()
export class AdminRiderZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list() {
    const zones = await this.prisma.deliveryZone.findMany({ orderBy: { name: 'asc' } });
    return zones.map(mapZone);
  }

  async create(adminId: string, dto: CreateZoneDto) {
    const existing = await this.prisma.deliveryZone.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`A zone named "${dto.name}" already exists.`);
    }

    const zone = await this.prisma.deliveryZone.create({
      data: {
        name: dto.name,
        city: dto.city,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusKm: dto.radiusKm ?? 6,
      },
    });

    await this.auditLog.log({
      actorId: adminId,
      action: 'rider_zone.create',
      targetType: 'DeliveryZone',
      targetId: zone.id,
      metadata: { name: zone.name, city: zone.city, radiusKm: zone.radiusKm },
    });

    return mapZone(zone);
  }

  async update(adminId: string, id: string, dto: UpdateZoneDto) {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!zone) {
      throw new NotFoundException('Zone not found.');
    }
    if (dto.name && dto.name !== zone.name) {
      const duplicate = await this.prisma.deliveryZone.findUnique({ where: { name: dto.name } });
      if (duplicate) {
        throw new ConflictException(`A zone named "${dto.name}" already exists.`);
      }
    }

    const updated = await this.prisma.deliveryZone.update({
      where: { id },
      data: {
        name: dto.name,
        city: dto.city,
        centerLat: dto.centerLat,
        centerLng: dto.centerLng,
        radiusKm: dto.radiusKm,
        isActive: dto.isActive,
      },
    });

    await this.auditLog.log({
      actorId: adminId,
      action: 'rider_zone.update',
      targetType: 'DeliveryZone',
      targetId: id,
      metadata: { ...dto },
    });

    return mapZone(updated);
  }
}
