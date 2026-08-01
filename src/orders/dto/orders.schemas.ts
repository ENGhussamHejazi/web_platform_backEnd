import { z } from 'zod';

export const ORDER_STATUS_VALUES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export const PAYMENT_STATUS_VALUES = [
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export const RETURN_STATUS_VALUES = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'AWAITING_PRODUCT',
  'PRODUCT_RECEIVED',
  'INSPECTING',
  'REFUND_PENDING',
  'REFUNDED',
  'COMPLETED',
] as const;

export const RESTOCK_DECISION_VALUES = [
  'NONE',
  'RESTOCK_AVAILABLE',
  'RESTOCK_DAMAGED',
  'INSPECTION',
  'SUPPLIER',
] as const;

export const REFUND_STATUS_VALUES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
] as const;

export const PAYMENT_METHOD_VALUES = [
  'CASH_ON_DELIVERY',
  'CARD',
  'CRYPTO',
] as const;

export const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  governorate: z.string().trim().optional(),
  cityId: z.string().uuid().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});
export type ListOrdersQueryDto = z.infer<typeof listOrdersQuerySchema>;

export const listReturnsQuerySchema = z.object({
  status: z.enum(RETURN_STATUS_VALUES).optional(),
});
export type ListReturnsQueryDto = z.infer<typeof listReturnsQuerySchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
  reason: z.string().trim().min(1).max(500).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;

export const createOrderNoteSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  pinned: z.boolean().optional(),
  attachmentUrl: z.string().url().optional(),
});
export type CreateOrderNoteDto = z.infer<typeof createOrderNoteSchema>;

export const updateOrderNoteSchema = z.object({
  content: z.string().trim().min(1).max(2000).optional(),
  pinned: z.boolean().optional(),
});
export type UpdateOrderNoteDto = z.infer<typeof updateOrderNoteSchema>;

export const assignDriverSchema = z.object({
  driverName: z.string().trim().min(1).max(200),
  driverPhone: z.string().trim().min(1).max(50),
  trackingNumber: z.string().trim().max(100).optional(),
  estimatedDeliveryAt: z.string().datetime().optional(),
});
export type AssignDriverDto = z.infer<typeof assignDriverSchema>;

export const reportDeliveryFailureSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type ReportDeliveryFailureDto = z.infer<
  typeof reportDeliveryFailureSchema
>;

export const updatePaymentSchema = z.object({
  paymentStatus: z.enum(PAYMENT_STATUS_VALUES),
  paidAmount: z.number().nonnegative(),
  paymentReference: z.string().trim().max(200).optional(),
  paymentProofUrl: z.string().url().optional(),
  paymentDate: z.string().datetime().optional(),
});
export type UpdatePaymentDto = z.infer<typeof updatePaymentSchema>;

export const createReturnSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  customerDescription: z.string().trim().max(2000).optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        requestedQty: z.number().int().positive(),
      }),
    )
    .min(1),
});
export type CreateReturnDto = z.infer<typeof createReturnSchema>;

export const updateReturnSchema = z.object({
  status: z.enum(RETURN_STATUS_VALUES).optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        approvedQty: z.number().int().nonnegative().optional(),
        condition: z.string().trim().max(500).optional(),
        restockDecision: z.enum(RESTOCK_DECISION_VALUES).optional(),
      }),
    )
    .optional(),
});
export type UpdateReturnDto = z.infer<typeof updateReturnSchema>;

export const createRefundSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHOD_VALUES),
  returnId: z.string().optional(),
});
export type CreateRefundDto = z.infer<typeof createRefundSchema>;
