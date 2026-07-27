import { IsEmail, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateCorporateInquiryDto {
  @IsString()
  @MinLength(1)
  companyName!: string;

  @IsString()
  @MinLength(1)
  contactName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsString()
  occasion?: string;

  @IsInt()
  @Min(1)
  estimatedQuantity!: number;

  @IsOptional()
  @IsString()
  budgetRange?: string;

  @IsString()
  @MinLength(1)
  message!: string;
}
