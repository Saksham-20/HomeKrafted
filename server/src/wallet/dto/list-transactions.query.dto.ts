import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Cursor page over the wallet ledger — `GET /wallet/transactions`. */
export class ListTransactionsQueryDto {
  /**
   * Rows per page. Capped at 100 so a caller cannot ask for the whole
   * ledger back by passing a large number, which is the failure this
   * pagination exists to close.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /**
   * The `nextCursor` from the previous page — a `WalletTransaction.id`.
   * A cursor only ever states a *position*; the `walletId` filter is
   * applied independently of it, so passing another wallet's id can move
   * where this wallet's page starts but can never return a row belonging
   * to anyone else. Asserted in `wallet-pagination.e2e-spec.ts` rather
   * than assumed.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}
