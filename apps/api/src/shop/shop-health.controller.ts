import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller()
export class ShopHealthController {
  @Get('health')
  health() {
    return { ok: true, service: 'api-shop' };
  }
}
