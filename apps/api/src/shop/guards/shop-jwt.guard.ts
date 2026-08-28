import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ShopCompteService } from '../shop-compte.service';

@Injectable()
export class ShopJwtGuard implements CanActivate {
  constructor(private readonly compte: ShopCompteService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      shopCompteId?: string;
    }>();
    const auth = req.headers.authorization;
    const token = auth?.replace(/^Bearer\s+/i, '');
    if (!token) {
      throw new UnauthorizedException('Token compte client requis.');
    }
    const payload = this.compte.verifyToken(token);
    req.shopCompteId = payload.sub;
    return true;
  }
}
