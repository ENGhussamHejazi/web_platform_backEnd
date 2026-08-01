import { z } from 'zod';

export const monitoringErrorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  before: z.string().datetime().optional(),
});
export type MonitoringErrorsQueryDto = z.infer<typeof monitoringErrorsQuerySchema>;
