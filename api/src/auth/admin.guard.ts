import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}
