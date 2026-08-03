import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Prisma } from '../../generated/prisma';
import {
  CreateCategoryDto,
  CreateProductDto,
  ListProductsQueryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './dto/products.schemas';
import { storeSupportsWeightSelling } from '../entitlements/business-categories';

const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  compareAtPrice: true,
  stock: true,
  isActive: true,
  isFeatured: true,
  isNewArrival: true,
  categoryId: true,
  createdAt: true,
  hasVariants: true,
  isBox: true,
  boxMaxItems: true,
  soldByWeight: true,
  weightUnit: true,
  minOrderQuantity: true,
  stepQuantity: true,
  category: { select: { id: true, name: true } },
  boxItems: {
    select: {
      id: true,
      sortOrder: true,
      itemProduct: {
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          isActive: true,
          images: { select: { url: true }, take: 1, orderBy: { sortOrder: 'asc' as const } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  boxPresets: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
      sortOrder: true,
      isActive: true,
      items: {
        select: {
          id: true,
          itemProductId: true,
          quantity: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
  images: {
    select: { id: true, url: true, publicId: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  variants: {
    select: {
      id: true,
      size: true,
      color: true,
      colorHex: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      stock: true,
      isActive: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.ProductSelect;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Best-effort remote cleanup — a Cloudinary hiccup must never block a DB write. */
  private async deleteRemoteImages(publicIds: (string | null)[]) {
    await Promise.all(
      publicIds
        .filter((id): id is string => !!id)
        .map((id) => this.storage.deleteImage(id)),
    );
  }

  private categorySlug(value: string) {
    return value
      .trim()
      .toLocaleLowerCase('ar')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '');
  }

  private toDto<
    T extends {
      price: Prisma.Decimal;
      compareAtPrice: Prisma.Decimal | null;
      stock: Prisma.Decimal;
      minOrderQuantity?: Prisma.Decimal | null;
      stepQuantity?: Prisma.Decimal | null;
      variants?: {
        price: Prisma.Decimal | null;
        compareAtPrice: Prisma.Decimal | null;
        stock: Prisma.Decimal;
      }[];
      boxItems?: {
        itemProduct: { price: Prisma.Decimal; stock: Prisma.Decimal } & Record<
          string,
          unknown
        >;
      }[];
    },
  >(product: T) {
    return {
      ...product,
      price: Number(product.price),
      compareAtPrice:
        product.compareAtPrice === null ? null : Number(product.compareAtPrice),
      stock: Number(product.stock),
      minOrderQuantity:
        product.minOrderQuantity == null ? null : Number(product.minOrderQuantity),
      stepQuantity:
        product.stepQuantity == null ? null : Number(product.stepQuantity),
      variants: product.variants?.map((v) => ({
        ...v,
        price: v.price === null ? null : Number(v.price),
        compareAtPrice:
          v.compareAtPrice === null ? null : Number(v.compareAtPrice),
        stock: Number(v.stock),
      })),
      boxItems: product.boxItems?.map((bi) => ({
        ...bi,
        itemProduct: {
          ...bi.itemProduct,
          price: Number(bi.itemProduct.price),
          stock: Number(bi.itemProduct.stock),
        },
      })),
    };
  }

  async list(storeId: string, query: ListProductsQueryDto) {
    const where: Prisma.ProductWhereInput = { storeId };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_SELECT,
    });
    return products.map((p) => this.toDto(p));
  }

  async get(storeId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, storeId },
      select: PRODUCT_SELECT,
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return this.toDto(product);
  }

  async create(storeId: string, dto: CreateProductDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        businessCategories: true,
        plan: { select: { maxProducts: true, maxImagesPerProduct: true } },
      },
    });
    if (dto.soldByWeight && !storeSupportsWeightSelling(store?.businessCategories)) {
      throw new BadRequestException(
        'البيع بالوزن غير متاح لنوع نشاط متجرك الحالي',
      );
    }
    if (store?.plan?.maxProducts) {
      const productCount = await this.prisma.product.count({
        where: { storeId },
      });
      if (productCount >= store.plan.maxProducts) {
        throw new ConflictException(
          `لقد وصلت للحد الأقصى لعدد المنتجات (${store.plan.maxProducts}) المسموح به في باقتك الحالية. يرجى ترقية الباقة لإضافة المزيد.`,
        );
      }
    }
    const imageLimit = store?.plan?.maxImagesPerProduct ?? 8;
    if ((dto.images?.length ?? 0) > imageLimit) {
      throw new ConflictException(`تسمح باقتك بحد أقصى ${imageLimit} صور لكل منتج.`);
    }
    const hasVariants = Boolean(dto.variants?.length);
    const isBox = Boolean(dto.isBox);
    if (isBox && dto.boxItemIds?.length) {
      await this.ensureEligibleBoxItems(storeId, dto.boxItemIds);
    }
    const product = await this.prisma.product.create({
      data: {
        storeId,
        name: dto.name,
        description: dto.description,
        price: new Prisma.Decimal(dto.price),
        compareAtPrice:
          dto.compareAtPrice != null
            ? new Prisma.Decimal(dto.compareAtPrice)
            : null,
        stock: new Prisma.Decimal(dto.stock),
        categoryId: dto.categoryId ?? null,
        isActive: dto.isActive,
        isFeatured: dto.isFeatured,
        isNewArrival: dto.isNewArrival,
        hasVariants,
        isBox,
        boxMaxItems: isBox ? dto.boxMaxItems : null,
        soldByWeight: Boolean(dto.soldByWeight),
        weightUnit: dto.soldByWeight ? dto.weightUnit : null,
        minOrderQuantity: dto.soldByWeight
          ? new Prisma.Decimal(dto.minOrderQuantity!)
          : null,
        stepQuantity: dto.soldByWeight
          ? new Prisma.Decimal(dto.stepQuantity!)
          : null,
        boxItems: isBox && dto.boxItemIds?.length
          ? {
              create: dto.boxItemIds.map((itemProductId, i) => ({
                itemProductId,
                sortOrder: i,
              })),
            }
          : undefined,
        images: dto.images?.length
          ? {
              create: dto.images.map((img, i) => ({
                url: img.url,
                publicId: img.publicId ?? null,
                sortOrder: i,
              })),
            }
          : undefined,
        variants: hasVariants
          ? {
              create: dto.variants!.map((v, i) => ({
                size: v.size ?? null,
                color: v.color ?? null,
                colorHex: v.colorHex ?? null,
                sku: v.sku ?? null,
                price: v.price != null ? new Prisma.Decimal(v.price) : null,
                compareAtPrice:
                  v.compareAtPrice != null
                    ? new Prisma.Decimal(v.compareAtPrice)
                    : null,
                stock: v.stock,
                isActive: v.isActive,
                sortOrder: v.sortOrder ?? i,
              })),
            }
          : undefined,
        boxPresets:
          isBox && dto.boxPresets?.length
            ? {
                create: dto.boxPresets.map((preset, i) => ({
                  name: preset.name,
                  imageUrl: preset.imageUrl ?? null,
                  sortOrder: preset.sortOrder ?? i,
                  isActive: preset.isActive,
                  items: {
                    create: preset.items.map((item, j) => ({
                      itemProductId: item.itemProductId,
                      quantity: item.quantity,
                      sortOrder: item.sortOrder ?? j,
                    })),
                  },
                })),
              }
            : undefined,
      },
      select: PRODUCT_SELECT,
    });
    return this.toDto(product);
  }

  /** Ensures every candidate id belongs to an active product in this store. */
  private async ensureEligibleBoxItems(storeId: string, itemIds: string[]) {
    const count = await this.prisma.product.count({
      where: { id: { in: itemIds }, storeId },
    });
    if (count !== new Set(itemIds).size) {
      throw new ConflictException('يتضمن الصندوق منتجاً غير موجود في متجرك');
    }
  }

  async update(storeId: string, id: string, dto: UpdateProductDto) {
    await this.ensureOwned(storeId, id);
    if (dto.soldByWeight) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { businessCategories: true },
      });
      if (!storeSupportsWeightSelling(store?.businessCategories)) {
        throw new BadRequestException(
          'البيع بالوزن غير متاح لنوع نشاط متجرك الحالي',
        );
      }
    }
    if (dto.images) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { plan: { select: { maxImagesPerProduct: true } } },
      });
      const imageLimit = store?.plan?.maxImagesPerProduct ?? 8;
      if (dto.images.length > imageLimit) {
        throw new ConflictException(`تسمح باقتك بحد أقصى ${imageLimit} صور لكل منتج.`);
      }
    }
    const isBox = dto.isBox;
    if (isBox && dto.boxItemIds?.length) {
      await this.ensureEligibleBoxItems(storeId, dto.boxItemIds);
    }

    const removedPublicIds: (string | null)[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price != null ? new Prisma.Decimal(dto.price) : undefined,
          compareAtPrice:
            dto.compareAtPrice !== undefined
              ? dto.compareAtPrice != null
                ? new Prisma.Decimal(dto.compareAtPrice)
                : null
              : undefined,
          stock: dto.stock != null ? new Prisma.Decimal(dto.stock) : undefined,
          categoryId: dto.categoryId !== undefined ? dto.categoryId : undefined,
          isActive: dto.isActive,
          isFeatured: dto.isFeatured,
          isNewArrival: dto.isNewArrival,
          hasVariants: dto.variants?.length ? true : undefined,
          isBox: dto.isBox,
          boxMaxItems:
            dto.isBox !== undefined ? (dto.isBox ? dto.boxMaxItems : null) : undefined,
          soldByWeight: dto.soldByWeight,
          weightUnit:
            dto.soldByWeight !== undefined
              ? dto.soldByWeight
                ? dto.weightUnit
                : null
              : undefined,
          minOrderQuantity:
            dto.soldByWeight !== undefined
              ? dto.soldByWeight && dto.minOrderQuantity != null
                ? new Prisma.Decimal(dto.minOrderQuantity)
                : null
              : undefined,
          stepQuantity:
            dto.soldByWeight !== undefined
              ? dto.soldByWeight && dto.stepQuantity != null
                ? new Prisma.Decimal(dto.stepQuantity)
                : null
              : undefined,
        },
      });

      if (dto.images) {
        const oldImages = await tx.productImage.findMany({
          where: { productId: id },
          select: { publicId: true },
        });
        removedPublicIds.push(...oldImages.map((img) => img.publicId));
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (dto.images.length) {
          await tx.productImage.createMany({
            data: dto.images.map((img, i) => ({
              productId: id,
              url: img.url,
              publicId: img.publicId ?? null,
              sortOrder: i,
            })),
          });
        }
      }

      if (dto.variants) {
        await this.syncVariants(tx, id, dto.variants);
      }

      if (dto.boxItemIds) {
        await tx.boxItem.deleteMany({ where: { boxProductId: id } });
        if (dto.boxItemIds.length) {
          await tx.boxItem.createMany({
            data: dto.boxItemIds.map((itemProductId, i) => ({
              boxProductId: id,
              itemProductId,
              sortOrder: i,
            })),
          });
        }
      }

      if (dto.boxPresets) {
        // Presets aren't referenced by past orders (order lines snapshot the
        // actual chosen products, not the preset), so a full replace is safe.
        await tx.boxPreset.deleteMany({ where: { boxProductId: id } });
        for (const [i, preset] of dto.boxPresets.entries()) {
          await tx.boxPreset.create({
            data: {
              boxProductId: id,
              name: preset.name,
              imageUrl: preset.imageUrl ?? null,
              sortOrder: preset.sortOrder ?? i,
              isActive: preset.isActive,
              items: {
                create: preset.items.map((item, j) => ({
                  itemProductId: item.itemProductId,
                  quantity: item.quantity,
                  sortOrder: item.sortOrder ?? j,
                })),
              },
            },
          });
        }
      }
    });

    await this.deleteRemoteImages(removedPublicIds);

    return this.get(storeId, id);
  }

  /**
   * Reconciles a product's variant rows with the incoming list: updates
   * variants that carry an id, creates the rest, and for existing variants
   * missing from the incoming list either hard-deletes them (no order/stock
   * history) or soft-deletes via isActive:false (has history) — so past
   * orders and the stock ledger keep resolving to a real row.
   */
  private async syncVariants(
    tx: Prisma.TransactionClient,
    productId: string,
    variants: UpdateProductDto['variants'],
  ) {
    const incoming = variants ?? [];
    const existing = await tx.productVariant.findMany({
      where: { productId },
      select: { id: true },
    });
    const incomingIds = new Set(incoming.filter((v) => v.id).map((v) => v.id));
    const removedIds = existing
      .map((v) => v.id)
      .filter((id) => !incomingIds.has(id));

    for (const i in incoming) {
      const v = incoming[i];
      const data = {
        size: v.size ?? null,
        color: v.color ?? null,
        colorHex: v.colorHex ?? null,
        sku: v.sku ?? null,
        price: v.price != null ? new Prisma.Decimal(v.price) : null,
        compareAtPrice:
          v.compareAtPrice != null ? new Prisma.Decimal(v.compareAtPrice) : null,
        stock: v.stock,
        isActive: v.isActive,
        sortOrder: v.sortOrder ?? Number(i),
      };
      if (v.id) {
        await tx.productVariant.update({ where: { id: v.id }, data });
      } else {
        await tx.productVariant.create({ data: { ...data, productId } });
      }
    }

    for (const variantId of removedIds) {
      const [orderItemCount, reservationCount, movementCount] =
        await Promise.all([
          tx.orderItem.count({ where: { variantId } }),
          tx.stockReservation.count({ where: { variantId } }),
          tx.stockMovement.count({ where: { variantId } }),
        ]);
      if (orderItemCount || reservationCount || movementCount) {
        await tx.productVariant.update({
          where: { id: variantId },
          data: { isActive: false },
        });
      } else {
        await tx.productVariant.delete({ where: { id: variantId } });
      }
    }
  }

  async remove(storeId: string, id: string) {
    await this.ensureOwned(storeId, id);
    const images = await this.prisma.productImage.findMany({
      where: { productId: id },
      select: { publicId: true },
    });
    await this.prisma.product.delete({ where: { id } });
    await this.deleteRemoteImages(images.map((img) => img.publicId));
    return { deleted: true };
  }

  async listCategories(storeId: string) {
    return this.prisma.category.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        imageUrl: true,
        slug: true,
        icon: true,
        sortOrder: true,
        isActive: true,
        isVisible: true,
        parentCategoryId: true,
        _count: { select: { products: true } },
      },
    });
  }

  async createCategory(storeId: string, dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: {
          storeId,
          name: dto.name,
          slug: dto.slug ?? this.categorySlug(dto.name),
          imageUrl: dto.imageUrl ?? null,
          icon: dto.icon ?? null,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
          isVisible: dto.isVisible,
          parentCategoryId: dto.parentCategoryId ?? null,
        },
        select: {
          id: true, name: true, slug: true, imageUrl: true, icon: true,
          sortOrder: true, isActive: true, isVisible: true, parentCategoryId: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('اسم التصنيف أو رابطه مستخدم مسبقاً');
      }
      throw err;
    }
  }

  async updateCategory(storeId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, storeId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('التصنيف غير موجود');

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : undefined,
        icon: dto.icon !== undefined ? dto.icon : undefined,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        isVisible: dto.isVisible,
        parentCategoryId:
          dto.parentCategoryId !== undefined ? dto.parentCategoryId : undefined,
      },
      select: {
        id: true, name: true, slug: true, imageUrl: true, icon: true,
        sortOrder: true, isActive: true, isVisible: true, parentCategoryId: true,
      },
    });
  }

  async reorderCategories(
    storeId: string,
    { categoryIds }: ReorderCategoriesDto,
  ) {
    const ownedCount = await this.prisma.category.count({
      where: { storeId, id: { in: categoryIds } },
    });
    if (ownedCount !== categoryIds.length) {
      throw new NotFoundException('يتضمن الترتيب تصنيفاً غير موجود');
    }
    await this.prisma.$transaction(
      categoryIds.map((id, sortOrder) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return this.listCategories(storeId);
  }

  async removeCategory(storeId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, storeId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('التصنيف غير موجود');
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureOwned(storeId: string, id: string) {
    const exists = await this.prisma.product.findFirst({
      where: { id, storeId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('المنتج غير موجود');
  }
}
