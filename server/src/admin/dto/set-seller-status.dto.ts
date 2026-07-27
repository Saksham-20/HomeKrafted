import { IsIn } from 'class-validator';

/**
 * `PATCH /admin/sellers/:id/status` — suspend/reactivate an already-active
 * seller. Deliberately excludes `"pending"`: that transition only ever
 * happens via the approval queue (`POST /admin/sellers/applications/:id/approve`),
 * which mints the `Seller` row already `status: "approved"` — there's no
 * "un-approve back to pending" action.
 */
export class SetSellerStatusDto {
  @IsIn(['approved', 'suspended'])
  status!: 'approved' | 'suspended';
}
