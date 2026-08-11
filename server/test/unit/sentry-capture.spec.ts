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
/**
 * `setHeader` is part of this fake because the filter really calls it on a
 * 5xx (the `X-Request-Id` correlation header). A fake missing a method the
 * production path uses does not make the test independent of the response
 * — it makes the test fail for a reason that has nothing to do with what
 * it is asserting, which is what happened when the header was added.
 */
function fakeHost(): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const setHeader = jest.fn();
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader }),
      getRequest: () => ({ method: 'GET', originalUrl: '/api/v1/test' }),
    }),
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
    const setHeader = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, setHeader }),
        getRequest: () => ({ method: 'GET', originalUrl: '/x' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new HttpException('Nope', HttpStatus.FORBIDDEN), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'Nope' } });
  });
});

/**
 * The reference id on a 5xx.
 *
 * **Why it exists.** In production the filter replaces a 500's real
 * message with "Something went wrong. Please try again." — correct, since
 * Prisma's errors name tables, columns and constraints. The cost was that
 * every 500 report from a user was identical and therefore unsearchable:
 * "it said something went wrong" describes every server error this app has
 * ever produced. A short id in the response, the header and the log turns
 * a screenshot into a grep.
 *
 * **Why 5xx only.** A 400 already says which field is wrong and a 404 is
 * not an incident. Putting a reference on those makes it ordinary
 * furniture, and a code people see on every validation message is a code
 * nobody quotes when it finally matters.
 */
describe('AllExceptionsFilter → error reference', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
  });

  afterEach(() => jest.restoreAllMocks());

  function capture() {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const setHeader = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, setHeader }),
        getRequest: () => ({ method: 'POST', originalUrl: '/api/v1/orders' }),
      }),
    } as unknown as ArgumentsHost;
    return { json, status, setHeader, host };
  }

  it('attaches a reference and a header to an unexpected 500', () => {
    const { json, setHeader, host } = capture();

    filter.catch(new Error('Prisma pool exhausted'), host);

    const body = json.mock.calls[0][0] as { error: { reference?: string } };
    expect(body.error.reference).toMatch(/^[0-9a-f]{8}$/);
    // The same value in the header, so a network-tab screenshot is as
    // searchable as a quoted message.
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', body.error.reference);
  });

  it('logs the reference with the method and path, so it can be found', () => {
    const { json, host } = capture();
    const logged = jest.spyOn(filter['logger'], 'error');

    filter.catch(new Error('boom'), host);

    const body = json.mock.calls[0][0] as { error: { reference: string } };
    const lines = logged.mock.calls.map((c) => String(c[0]));
    // A reference that is only in the response is a reference nobody can
    // look up — the log line is the half that makes it worth printing.
    expect(lines.some((l) => l.includes(`ref=${body.error.reference}`))).toBe(true);
    expect(lines.some((l) => l.includes('POST') && l.includes('/api/v1/orders'))).toBe(true);
  });

  it('gives a different reference to each error', () => {
    const a = capture();
    const b = capture();
    filter.catch(new Error('one'), a.host);
    filter.catch(new Error('two'), b.host);

    const refA = (a.json.mock.calls[0][0] as { error: { reference: string } }).error.reference;
    const refB = (b.json.mock.calls[0][0] as { error: { reference: string } }).error.reference;
    expect(refA).not.toEqual(refB);
  });

  it('does not attach one to a 4xx', () => {
    const { json, setHeader, host } = capture();

    filter.catch(new HttpException('Nope', HttpStatus.BAD_REQUEST), host);

    expect(json).toHaveBeenCalledWith({ error: { code: 'BAD_REQUEST', message: 'Nope' } });
    expect(setHeader).not.toHaveBeenCalled();
  });
});
