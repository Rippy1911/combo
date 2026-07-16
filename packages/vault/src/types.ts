import { z } from "zod";

export const VaultEntrySchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  encryptedValue: z.string(),
  createdAt: z.string().datetime(),
});

export type VaultEntry = z.infer<typeof VaultEntrySchema>;
