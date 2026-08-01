import { z } from 'zod';

export const merchantReportsQuerySchema = z.object({
  range: z.enum(['7', '30', '90']).default('30'),
});
export type MerchantReportsQueryDto = z.infer<
  typeof merchantReportsQuerySchema
>;

export const inventoryProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
});
export type InventoryProductsQueryDto = z.infer<
  typeof inventoryProductsQuerySchema
>;

export const STOCK_MOVEMENT_TYPE_VALUES = [
  'OPENING_STOCK',
  'ORDER_RESERVATION',
  'RESERVATION_RELEASE',
  'SALE',
  'PURCHASE_RECEIPT',
  'RETURN_TO_STOCK',
  'DAMAGED_RETURN',
  'MANUAL_ADJUSTMENT_INCREASE',
  'MANUAL_ADJUSTMENT_DECREASE',
  'DAMAGED',
  'LOST',
  'TRANSFER_OUT',
  'TRANSFER_IN',
] as const;

export const stockMovementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
  productId: z.string().uuid().optional(),
  type: z.enum(STOCK_MOVEMENT_TYPE_VALUES).optional(),
});
export type StockMovementsQueryDto = z.infer<typeof stockMovementsQuerySchema>;

export const ORDER_STATUS_VALUES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
});
export type TransactionsQueryDto = z.infer<typeof transactionsQuerySchema>;

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  type: z.enum(['DAMAGED', 'LOST', 'RETURN_TO_STOCK', 'DAMAGED_RETURN']),
  reason: z.string().trim().min(3).max(300),
  relatedOrderId: z.string().uuid().optional(),
});
export type AdjustStockDto = z.infer<typeof adjustStockSchema>;
