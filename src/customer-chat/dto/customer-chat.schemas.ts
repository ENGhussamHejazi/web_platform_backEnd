import { z } from 'zod';

export const sendCustomerMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type SendCustomerMessageDto = z.infer<typeof sendCustomerMessageSchema>;
