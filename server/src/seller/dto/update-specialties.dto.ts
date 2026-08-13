import { ArrayNotEmpty, ArrayUnique, IsIn } from 'class-validator';
import { SellerSpecialty } from '@prisma/client';
import { ALL_SPECIALTIES } from '../../seller-applications/specialty-taxonomy';

/**
 * What a HomeKrafter makes, re-stated by the HomeKrafter themselves
 * (M33, owner brief: "if someone has registered for food, he/she can
 * register for gifting partner and other categories under the same
 * account").
 *
 * **This adds no new capability, and that is the point.** One supply role
 * has had every portal module since M12, and `specialties` has been
 * discovery metadata that must never decide access since the same
 * milestone — so a kitchen approved for pickles could already list a
 * candle. What they could not do was *say so*: the tags were written once
 * at approval from the application form and there was no route to change
 * them afterwards, on either surface. The `/sell` form has told every
 * applicant "you can change this later" since M22, and that sentence was
 * not true. It is now.
 *
 * So this is a **full replacement, not an append**. Somebody who stops
 * making sweets needs to stop being found for sweets; a bag that only
 * grows is a filter that slowly stops meaning anything.
 *
 * The whole list is sent every time rather than an add/remove delta,
 * because the UI is a set of chips — the user's intent is the final set,
 * and a delta computed on the client is a lost-update the moment two tabs
 * are open.
 */
export class UpdateSellerSpecialtiesDto {
  /**
   * At least one. An empty list is not "no preference" — it is a
   * storefront that no category filter can return, which is a worse
   * outcome than a stale tag and one the HomeKrafter would have no way to
   * diagnose.
   */
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(ALL_SPECIALTIES, { each: true })
  specialties!: SellerSpecialty[];
}
