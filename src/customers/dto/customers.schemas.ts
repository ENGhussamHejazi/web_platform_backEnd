import { z } from 'zod';

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
});
export type ListCustomersQueryDto = z.infer<typeof listCustomersQuerySchema>;
