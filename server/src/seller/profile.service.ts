import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VendorProfileService, mapPhoto } from '../catalog/vendor-profile.service';
import { AdminAuditLogService } from '../admin/audit-log.service';
import { areaById, distanceKm } from '../common/geo';
import { lookupPincode } from '../common/pincodes';
import { UpdateSellerProfileDto } from './dto/update-profile.dto';
import { SetOwnCoordsDto } from './dto/set-own-coords.dto';
import {
  AddVendorPhotoDto,
  ReorderVendorPhotosDto,
  UpdateVendorPhotoDto,
} from './dto/vendor-photo.dto';

/** Photos beyond this stop being a profile and start being a gallery nobody scrolls. */
const MAX_PHOTOS = 12;

/**
 * How far past its anchor a self-set pin may land.
 *
 * A pincode's centroid is the mean of its post offices, not anybody's
 * house — even with `spreadKm: 0` (a single post office) the kitchen is
 * legitimately some distance from it. 10 km on top of the measured
 * spread accepts every honest fix; a pin further out than the pincode's
 * own worst-case geography is a different pincode's kitchen.
 */
const PIN_MARGIN_KM = 10;

/**
 * For a pre-M36 kitchen (no pincode, curated tricity area): the whole
 * tricity fits inside roughly 30 km, so a pin 25 km from the stated
 * area has left the area. Anchored to the *curated area's* coordinates,
 * never the current pin — anchoring to the current pin would let
 * repeated small moves walk a storefront anywhere.
 */
const AREA_MARGIN_KM = 25;

/**
 * The HomeKrafter's own profile (M16). Every method takes a `vendorId`
 * that the controller resolved from the caller's own `Seller` row — there
 * is no route here that accepts a vendor id from the client, the same
 * ownership rule the rest of `SellerService` follows.
 */
@Injectable()
export class SellerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: VendorProfileService,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  get(vendorId: string) {
    return this.profiles.ownProfile(vendorId);
  }

  /**
   * Upsert, because a profile row doesn't exist until the first save —
   * approval mints a `Vendor`, not a `VendorProfile`, so the first PATCH
   * is a create.
   *
   * The payload is assembled field-by-field rather than spread from the
   * DTO. That is deliberate: spreading would mean any field later added
   * to the DTO silently reaches a column, and three of the columns on
   * this table are the verification badge. An explicit list makes adding
   * a writable field a decision instead of an accident.
   */
  async updateOwn(vendorId: string, dto: UpdateSellerProfileDto) {
    await this.requireVendor(vendorId);

    const data: Prisma.VendorProfileUncheckedCreateInput = { vendorId };
    const assign = <K extends keyof UpdateSellerProfileDto>(key: K) => {
      if (dto[key] !== undefined) {
        (data as Record<string, unknown>)[key as string] = dto[key];
      }
    };

    (
      [
        'tagline',
        'story',
        'knownFor',
        'languages',
        'prepTimeMins',
        'responseTimeMins',
        'capacityPerDay',
        'minOrderValue',
        'workingDays',
        'opensAt',
        'closesAt',
        'cancellationPolicy',
        'returnPolicy',
        'customOrderPolicy',
        'acceptsCustomOrders',
        'packagingNote',
        'hygieneNote',
        'instagramUrl',
        'facebookUrl',
        'youtubeUrl',
        'websiteUrl',
      ] as const
    ).forEach(assign);

    // A changed licence number has not been checked. Letting a verified
    // badge survive an edit to the thing it verifies is the one way a
    // seller could set their own badge through this endpoint.
    const existing = await this.prisma.vendorProfile.findUnique({ where: { vendorId } });
    const fssaiChanged = dto.fssaiNumber !== undefined && dto.fssaiNumber !== existing?.fssaiNumber;
    if (dto.fssaiNumber !== undefined) {
      data.fssaiNumber = dto.fssaiNumber;
      if (fssaiChanged) {
        data.fssaiVerified = false;
        data.verifiedAt = null;
        data.verificationNote = null;
      }
    }

    // The pickup address (M36c) — theirs to change, because people move.
    //
    // **Any change clears `addressVerified`**, exactly as a changed
    // licence number clears `fssaiVerified` above, and for the same
    // reason: an admin verified a specific address, and letting the badge
    // survive an edit to the thing it verifies would be a seller setting
    // their own badge through this endpoint. Re-verification is cheap;
    // a badge that means nothing is not.
    const PICKUP_FIELDS = [
      'pickupAddressLine1',
      'pickupAddressLine2',
      'pickupLandmark',
      'pickupPincode',
      'pickupPhone',
    ] as const;

    let pickupChanged = false;
    for (const field of PICKUP_FIELDS) {
      if (dto[field] === undefined) continue;
      // Empty string is a deliberate clear of an optional line, stored as
      // NULL so "they removed it" and "they never gave it" read the same
      // downstream — the same shape every other optional field here uses.
      const next = dto[field]?.trim() ? dto[field]!.trim() : null;
      if (next !== (existing?.[field] ?? null)) pickupChanged = true;
      data[field] = next;
    }
    if (pickupChanged) {
      data.addressVerified = false;
      // Deliberately narrower than the FSSAI branch above, which also
      // clears `verifiedAt`/`verificationNote`. Those are shared across
      // all three badges, so wiping them here would erase the record of
      // an identity check that is still perfectly valid.
    }

    // `vendorId` is the key, not a writable column — it belongs in the
    // `create` payload and must not appear in `update`.
    const { vendorId: _vendorId, ...updatePayload } = data;
    void _vendorId;
    await this.prisma.vendorProfile.upsert({
      where: { vendorId },
      create: data,
      update: updatePayload,
    });

    return this.profiles.ownProfile(vendorId);
  }

  /**
   * The kitchen pins its own exact location — see `SetOwnCoordsDto` for
   * why this exists and what keeps it honest.
   *
   * The pin is checked against the coarsest location claim we hold and
   * an admin can independently see: the pincode (centroid + its measured
   * spread + margin), or for a pre-M36 kitchen the curated area. A pin
   * outside that is refused with the distance in the sentence, because
   * "we didn't save that" with no reason reads as a broken button.
   *
   * Precision never reaches a buyer: `mapVendor` rounds every public
   * payload to ~1.1 km whoever set the pin. This value feeds server-side
   * distance filtering only.
   */
  async setOwnCoords(vendorId: string, actorUserId: string, dto: SetOwnCoordsDto) {
    const vendor = await this.requireVendor(vendorId);

    const pin = { lat: dto.lat, lng: dto.lng };
    const record = vendor.pincode ? lookupPincode(vendor.pincode) : undefined;
    const area = record ? undefined : areaById(vendor.area);
    const anchor = record ?? area;
    if (anchor) {
      const allowedKm = record ? record.spreadKm + PIN_MARGIN_KM : AREA_MARGIN_KM;
      const km = distanceKm(pin, anchor);
      if (km > allowedKm) {
        const place = record
          ? `pincode ${vendor.pincode} (${record.district}, ${record.state})`
          : `${area!.label}, ${area!.city}`;
        throw new BadRequestException(
          `That pin is ${Math.round(km)} km from ${place}, which is where this kitchen is registered — we could not save it. ` +
            `If you have genuinely moved, update your pickup address first so we can re-check, or write to support.`,
        );
      }
    }
    // No anchor at all — a pincode the table doesn't know and an area id
    // the curated list doesn't carry — falls through to the save. The
    // badge reset below still puts an admin's eyes on it, which is the
    // most any check could achieve for a location we can't corroborate.

    // One transaction: the pin and the badge reset land together, or a
    // failure between them leaves a "verified" address at coordinates
    // nobody verified.
    await this.prisma.$transaction([
      this.prisma.vendor.update({
        where: { id: vendorId },
        data: { lat: dto.lat, lng: dto.lng, pinConfirmedAt: new Date() },
      }),
      // Upsert, because a profile row doesn't exist until the first save
      // — same reason `updateOwn` upserts. Deliberately narrower than the
      // FSSAI clear: `verifiedAt`/`verificationNote` belong to the
      // identity and licence checks too (M36c).
      this.prisma.vendorProfile.upsert({
        where: { vendorId },
        create: { vendorId, addressVerified: false },
        update: { addressVerified: false },
      }),
    ]);

    // After the mutation succeeds, never before — the audit-log rule.
    await this.auditLog.log({
      actorId: actorUserId,
      action: 'vendor.set_coords_self',
      targetType: 'Vendor',
      targetId: vendorId,
      metadata: {
        before: { lat: vendor.lat, lng: vendor.lng },
        after: { lat: dto.lat, lng: dto.lng },
      },
    });

    return { lat: dto.lat, lng: dto.lng, addressVerified: false };
  }

  // -------------------------------------------------------------------
  // Kitchen photos
  // -------------------------------------------------------------------

  async listPhotos(vendorId: string) {
    const photos = await this.prisma.vendorPhoto.findMany({
      where: { vendorId },
      orderBy: { sortOrder: 'asc' },
    });
    return photos.map(mapPhoto);
  }

  async addPhoto(vendorId: string, dto: AddVendorPhotoDto) {
    await this.requireVendor(vendorId);
    const count = await this.prisma.vendorPhoto.count({ where: { vendorId } });
    if (count >= MAX_PHOTOS) {
      throw new ConflictException(`A storefront can show up to ${MAX_PHOTOS} photos`);
    }
    const photo = await this.prisma.vendorPhoto.create({
      data: { vendorId, url: dto.url, caption: dto.caption, kind: dto.kind, sortOrder: count },
    });
    return mapPhoto(photo);
  }

  async updatePhoto(vendorId: string, photoId: string, dto: UpdateVendorPhotoDto) {
    await this.requirePhoto(vendorId, photoId);
    const photo = await this.prisma.vendorPhoto.update({
      where: { id: photoId },
      data: { caption: dto.caption, kind: dto.kind, sortOrder: dto.sortOrder },
    });
    return mapPhoto(photo);
  }

  async removePhoto(vendorId: string, photoId: string) {
    await this.requirePhoto(vendorId, photoId);
    await this.prisma.vendorPhoto.delete({ where: { id: photoId } });
    // The file itself stays on disk — nothing deletes uploads yet (M14,
    // see docs/DEPLOY.md). Removing the row is what takes it off the page.
    return this.listPhotos(vendorId);
  }

  /** Scoped by `vendorId` in the update filter, so an id belonging to another kitchen matches nothing rather than reordering their gallery. */
  async reorderPhotos(vendorId: string, dto: ReorderVendorPhotosDto) {
    await this.prisma.$transaction(
      dto.ids.map((id, index) =>
        this.prisma.vendorPhoto.updateMany({ where: { id, vendorId }, data: { sortOrder: index } }),
      ),
    );
    return this.listPhotos(vendorId);
  }

  private async requireVendor(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async requirePhoto(vendorId: string, photoId: string) {
    const photo = await this.prisma.vendorPhoto.findFirst({ where: { id: photoId, vendorId } });
    if (!photo) throw new NotFoundException('Photo not found');
    return photo;
  }
}
