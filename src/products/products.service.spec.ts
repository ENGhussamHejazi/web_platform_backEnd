import { ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service';
import type { CreateProductDto } from './dto/products.schemas';

describe('ProductsService#create', () => {
  let prisma: {
    store: { findUnique: jest.Mock };
    product: { findUnique: jest.Mock; count: jest.Mock; create: jest.Mock };
  };
  let service: ProductsService;

  const dto: CreateProductDto = {
    name: 'منتج تجريبي',
    price: 1000,
    stock: 5,
    isActive: true,
    isFeatured: false,
    isNewArrival: false,
  } as CreateProductDto;

  beforeEach(() => {
    prisma = {
      store: { findUnique: jest.fn() },
      product: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'p1', images: [] }),
      },
    };
    service = new ProductsService(prisma as never, {
      deleteImage: jest.fn(),
    } as never);
  });

  it('blocks creation once the plan product limit is reached', async () => {
    prisma.store.findUnique.mockResolvedValue({ plan: { maxProducts: 5 } });
    prisma.product.count.mockResolvedValue(5);

    await expect(service.create('store-1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('allows creation while under the plan product limit', async () => {
    prisma.store.findUnique.mockResolvedValue({ plan: { maxProducts: 5 } });
    prisma.product.count.mockResolvedValue(4);

    await service.create('store-1', dto);
    expect(prisma.product.create).toHaveBeenCalled();
  });

  it('allows unlimited creation when the plan has no maxProducts', async () => {
    prisma.store.findUnique.mockResolvedValue({ plan: { maxProducts: null } });

    await service.create('store-1', dto);
    expect(prisma.product.count).not.toHaveBeenCalled();
    expect(prisma.product.create).toHaveBeenCalled();
  });
});
