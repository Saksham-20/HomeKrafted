import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

/**
 * Normalizes every thrown error (Nest `HttpException`s, class-validator
 * failures, unexpected exceptions) into the one envelope shape
 * `docs/API.md` promises: `{ error: { code, message } }` with a matching
 * HTTP status. `code` is a stable machine-readable string (SCREAMING_SNAKE,
 * derived from the exception name); `message` is human-readable — for
 * validation errors, `message` is the joined list of field errors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = httpStatusToCode(status);

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as { message?: string | string[]; error?: string };
        if (Array.isArray(b.message)) {
          message = b.message.join('; ');
          code = 'VALIDATION_ERROR';
        } else if (typeof b.message === 'string') {
          message = b.message;
        } else if (b.error) {
          message = b.error;
        }
      }
    } else if (exception instanceof Error) {
      // Log the real thing, return the generic default. An unexpected error
      // is by definition one nobody wrote a message for, and Prisma's are
      // the common case — `PrismaClientKnownRequestError` names the table,
      // the column and the constraint, which is a free schema dump for
      // anyone who can make a query fail. The audit found this live: an
      // unknown `GET /admin/exports/:kind` returned "Cannot destructure
      // property 'filename' of '(intermediate value)' as it is undefined."
      // Outside production the message is kept, because a 500 you can't
      // read is a 500 you debug by adding console.log.
      this.logger.error(exception.message, exception.stack);
      if (process.env.NODE_ENV !== 'production') {
        message = exception.message;
      }
    } else {
      this.logger.error('Unknown exception thrown', String(exception));
    }

    response.status(status).json({
      error: { code, message },
    });
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.PAYMENT_REQUIRED:
      return 'INSUFFICIENT_BALANCE';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    // Upload rejections: the status is what distinguishes "too big" from
    // "not an image we accept", so the client can branch without matching
    // on message text (see `UploadsService.storeImage`).
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return 'FILE_TOO_LARGE';
    case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
      return 'UNSUPPORTED_IMAGE';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}
