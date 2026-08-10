import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
// `@sentry/core`, not `@sentry/nestjs`: the decorator calls core's
// `captureException` directly, so spying on the re-export intercepts
// nothing and the test passes while reporting is broken — the same class
// of silent failure this file exists to catch.
import * as SentryCore from '@sentry/core';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

/**
 * Does the error reporter actually see anything?
 *
 * **The bug this guards is silent by construction.** `AllExceptionsFilter`
 * is registered globally with `@Catch()`, so it terminates every error
 * before `@sentry/nestjs`'s own filter would ever run. Install Sentry
 * without decorating this method and everything looks right: it boots,
 * the DSN is accepted, the scrub spec passes — and not one production
 * error is ever reported. You find out the week you need it.
 *
 * So this asserts the wiring rather than the configuration: throw
 * something through the real filter and check Sentry was handed it.
 * Removing `@SentryExceptionCaptured()` fails this test.
 */
function fakeHost(): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return {
    switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({}) }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter → Sentry', () => {
  let captureException: jest.SpyInstance;
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    // Quiet the filter's own error logging; the assertion is about Sentry.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    captureException = jest.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hands an unexpected throw to Sentry', () => {
    const boom = new Error('Prisma connection pool exhausted');

    filter.catch(boom, fakeHost());

    expect(captureException).toHaveBeenCalledWith(boom);
  });

  it('does not report a deliberate HttpException', () => {
    // The decorator's own `isExpectedError` skips anything carrying a
    // `status`, so control-flow errors — a 401 on a wrong password, a 404
    // for a missing order — never reach Sentry. That is the behaviour we
    // want and it is worth pinning: it is what keeps a public API's bot
    // traffic from consuming the whole error quota.
    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), fakeHost());
    expect(captureException).not.toHaveBeenCalled();
  });

  it('still normalises the response envelope while doing it', () => {
    // The decorator must not change what the client receives — the
    // `{ error: { code, message } }` shape `docs/API.md` promises.
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({}) }),
    } as unknown as ArgumentsHost;

    filter.catch(new HttpException('Nope', HttpStatus.FORBIDDEN), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'Nope' } });
  });
});
