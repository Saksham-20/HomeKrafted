import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VendorProfileService, mapPhoto } from '../catalog/vendor-profile.service';
import { UpdateSellerProfileDto } from './dto/update-profile.dto';
import {
  AddVendorPhotoDto,
  ReorderVendorPhotosDto,
  UpdateVendorPhotoDto,
} from './dto/vendor-photo.dto';

/** Photos beyond this stop being a profile and start being a gallery nobody scrolls. */
const MAX_PHOTOS = 12;

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
