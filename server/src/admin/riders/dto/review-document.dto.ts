import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * `PATCH /admin/riders/:id/documents/:kind`. A rejection needs a reason
 * — the M22 rule this whole codebase follows for a refusal: the sentence
 * reaches the rider verbatim, and it is the only thing telling them what
 * to re-upload.
 */
export class ReviewDocumentDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @ValidateIf((o: ReviewDocumentDto) => o.status === 'rejected')
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note?: string;
}
