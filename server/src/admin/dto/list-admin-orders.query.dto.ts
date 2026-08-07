import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AdminOrderType } from '../orders.service';

const TYPES: AdminOrderType[] = ['marketplace', 'laundry', 'snack'];

/** Query for the unified admin order list — `GET /admin/orders`. */
export class ListAdminOrdersQueryDto {
  @IsOptional()
  @IsIn(TYPES, { message: `type must be one of ${TYPES.join(', ')}` })
  type?: AdminOrderType;

  /**
   * Matches an order reference, the customer's name, or a HomeKrafter's
   * name — the three things the admin list row shows.
   *
   * Searched **server-side**. It used to be a filter over an
   * already-downloaded list, which worked only because the endpoint
   * returned every order that had ever been placed; the moment that list
   * is a page, a client-side search silently means "search the rows you
   * happen to be looking at" and answers "no orders match" for an order
   * that exists.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
