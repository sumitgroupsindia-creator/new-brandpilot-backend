import { BadRequestException, Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';

class CreateRechargeOrderDto {
  planId!: string;
}

class ConfirmRechargeOrderDto {
  orderId!: string;
  paymentId!: string;
  signature?: string;
}

@ApiTags('Wallet')
@Controller('wallet')
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('plans')
  getPlans() {
    return this.walletService.listPlans();
  }

  @Post('recharge/order')
  createRechargeOrder(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateRechargeOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Missing Idempotency-Key header');
    }
    return this.walletService.createRechargeOrder(userId, dto.planId, idempotencyKey.trim());
  }

  @Post('recharge/confirm')
  confirmRechargeOrder(
    @CurrentUser('sub') userId: string,
    @Body() dto: ConfirmRechargeOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Missing Idempotency-Key header');
    }
    return this.walletService.confirmRechargeOrder(userId, dto, idempotencyKey.trim());
  }
}
