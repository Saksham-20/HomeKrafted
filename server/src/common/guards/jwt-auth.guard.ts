import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload, RequestUser } from '../types/jwt-payload.type';
import { AppConfig } from '../../config/configuration';

/**
 * Global guard (registered as `APP_GUARD` in `AppModule`) — every route is
 * authed by default; `@Public()` opts a handler out. Verifies the access
 * token (never the refresh token — that only works against
 * `/auth/refresh`), then attaches `{ userId, role, sellerId? }` to
 * `request.user` for `@CurrentUser()`/`RolesGuard` to read.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
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

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get('jwt.accessSecret', { infer: true }),
      });
      const user: RequestUser = {
        userId: payload.sub,
        role: payload.role,
        sellerId: payload.sellerId,
      };
      (request as Request & { user: RequestUser }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
