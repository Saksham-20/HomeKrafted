import { AttributeKind, AttributeRequirement } from '@prisma/client';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BooleanField } from '../../common/decorators/boolean-field.decorator';

const KINDS = Object.values(AttributeKind);
const REQUIREMENTS = Object.values(AttributeRequirement);

/**
 * G1 — the attribute templates screen (docs/GIFTING-REWORK.md §4).
 *
 * `@BooleanField()` on every flag, never a bare `@IsBoolean()`: the global
 * pipe's `enableImplicitConversion` reads the string "false" as `true`, and
 * two of the flags here decide whether a machine may ever fill a question
 * in and whether editing it takes a live listing off sale.
 */
export class CreateAttributeDto {
  /**
   * The stable machine key. **Never renamed** — it is what a stored answer
   * and a shared filter URL both point at, the same contract as a category
   * slug (M58). Rename the label instead.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @IsIn(KINDS)
  kind!: AttributeKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpText?: string;

  /** "cm", "g", "hours" — for number and dimension questions. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  /** May this appear as a browse filter at all. */
  @IsOptional()
  @BooleanField()
  filterable?: boolean;

  /**
   * **Never prefilled by a machine, only ever answered by a person** —
   * allergens, nickel-free, vegan, age suitability, shelf life. A wrong
   * guess is the platform making a safety claim on a maker's behalf
   * (GIFTING-REWORK §8.2).
   */
  @IsOptional()
  @BooleanField()
  trustSensitive?: boolean;

  /** Editing this answer re-queues a live listing (M22's material change). */
  @IsOptional()
  @BooleanField()
  material?: boolean;
}

export class UpdateAttributeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string | null;

  @IsOptional()
  @BooleanField()
  filterable?: boolean;

  @IsOptional()
  @BooleanField()
  trustSensitive?: boolean;

  @IsOptional()
  @BooleanField()
  material?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateAttributeOptionDto {
  /** The stable machine value, never renamed. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  value!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  /** Colour swatches only. */
  @IsOptional()
  @IsString()
  @MaxLength(9)
  hex?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  synonyms?: string[];
}

/**
 * Ask this question on this shelf, or stop asking it.
 *
 * `requirement: null` unlinks. The listings' existing answers survive it —
 * a shelf that stops asking has not made the answers wrong, and an admin
 * who re-links gets them back.
 */
export class SetShelfQuestionDto {
  @IsString()
  @MinLength(1)
  attributeId!: string;

  @IsOptional()
  @IsIn(REQUIREMENTS)
  requirement?: AttributeRequirement | null;
}
