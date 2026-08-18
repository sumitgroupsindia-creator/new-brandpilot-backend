import { Controller, Get, Param, NotFoundException, Query, UseGuards, Res, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';

@ApiTags('Catalog')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('frames')
  listFrames(
    @CurrentUser('sub') userId: string,
    @Query('categoryId') categoryId?: string,
    @Query('filter') filter?: string,
  ) {
    return this.catalogService.listFrames(userId, categoryId, filter);
  }

  @Get('frames/:frameId')
  async getFrame(@Param('frameId') frameId: string, @CurrentUser('sub') userId: string) {
    const frame = await this.catalogService.getFrame(frameId, userId);
    if (!frame) {
      throw new NotFoundException('Frame not found');
    }
    return frame;
  }

  @Get('assets')
  listAssets() {
    return this.catalogService.listAssets();
  }

  @Get('frame-categories')
  listFrameCategories() {
    return this.catalogService.listFrameCategories();
  }

  @Get('image-categories')
  listImageCategories(@CurrentUser('sub') userId: string) {
    return this.catalogService.listImageCategories(userId);
  }

  @Get('projects')
  listProjects() {
    return this.catalogService.listProjects();
  }

  @Get('wallet/summary')
  getWalletSummary() {
    return this.catalogService.getWalletSummary();
  }

  @Get('wallet/ledger')
  getWalletLedger() {
    return this.catalogService.getWalletLedger();
  }

  @Get('image-proxy')
  @Public()
  async imageProxy(@Query('url') url: string, @Res() res: Response) {
    if (!url || !url.trim()) {
      throw new BadRequestException('Image URL is required');
    }

    const result = await this.catalogService.fetchImageForProxy(url.trim());
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(result.buffer);
  }
}
