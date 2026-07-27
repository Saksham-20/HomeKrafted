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
      this.logger.error(exception.message, exception.stack);
      message = exception.message;
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
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}
