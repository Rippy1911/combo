import { z } from "zod";

/** Vault entry schema — crypto implementation lands in Phase B. */
export const VaultEntrySchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  encryptedValue: z.string(),
  createdAt: z.string().datetime(),
});

export type VaultEntry = z.infer<typeof VaultEntrySchema>;

/** Vault interface stub (AES-GCM + PBKDF2 KEK in Phase B). */
export interface VaultStore {
  lock(): Promise<void>;
  unlock(passphrase: string): Promise<boolean>;
  isUnlocked(): boolean;
}

export const VAULT_ALGORITHM = "AES-GCM" as const;

export function getVaultAlgorithm(): typeof VAULT_ALGORITHM {
  return VAULT_ALGORITHM;
}
