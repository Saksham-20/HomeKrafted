import { BooleanField } from '../../common/decorators/boolean-field.decorator';

/** `PATCH /admin/users/:id` — the same `User.suspended` flag the auth layer already gates login on (`AuthService.login`/`.verifyOtp`/`.socialLogin`/`.refresh` all reject a suspended account). */
export class SetUserSuspendedDto {
  @BooleanField()
  suspended!: boolean;
}
