import { Controller, Get, Query } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { listMarketplaceStoresQuerySchema } from './dto/marketplace.schemas';
import type { ListMarketplaceStoresQueryDto } from './dto/marketplace.schemas';

@Controller('public/marketplace')
@Public()
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('stores')
  listStores(
    @Query(new ZodValidationPipe(listMarketplaceStoresQuerySchema))
    query: ListMarketplaceStoresQueryDto,
  ) {
    return this.marketplaceService.listStores(query);
  }

  @Get('facets')
  getFacets() {
    return this.marketplaceService.getFacets();
  }
}
