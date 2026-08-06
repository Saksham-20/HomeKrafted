import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload, RequestUser } from '../types/jwt-payload.type';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Global guard (registered as `APP_GUARD` in `AppModule`) — every route is
 * authed by default; `@Public()` opts a handler out. Verifies the access
 * token (never the refresh token — that only works against
 * `/auth/refresh`), then attaches `{ userId, role, sellerId? }` to
 * `request.user` for `@CurrentUser()`/`RolesGuard` to read.
 *
 * **Suspension is re-checked here, on every authenticated request.**
 * `assertNotSuspended` runs at `login`/`refresh`/`verifyOtp`/`socialLogin`,
 * which only decides whether a *new* session may start. Without this
 * lookup an already-issued access token kept working for the rest of its
 * `JWT_ACCESS_TTL` (15 minutes) — the audit confirmed a suspended account
 * still reading `/wallet` and still writing through `PATCH /users/me`.
 * Suspending somebody mid-abuse has to take effect immediately, which
 * means the token cannot be the only thing consulted.
 *
 * It costs one primary-key lookup per authenticated request. That is the
 * price of the guarantee; a TTL cache in front of it would reintroduce
 * exactly the staleness window being closed here.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // Outside the try/catch above on purpose: an `UnauthorizedException`
    // thrown in here must reach the client as its own message, not be
    // swallowed and relabelled "Invalid or expired access token".
    const account = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { suspended: true },
    });
    if (!account) {
      // A token signed for a user who no longer exists. Same answer as a
      // bad signature — the account is gone, the session goes with it.
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (account.suspended) {
      throw new UnauthorizedException('This account has been suspended. Contact support.');
    }

    const user: RequestUser = {
      userId: payload.sub,
      role: payload.role,
      sellerId: payload.sellerId,
    };
    (request as Request & { user: RequestUser }).user = user;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
