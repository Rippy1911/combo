export const VAULT_ALGORITHM = "AES-GCM" as const;

export function getVaultAlgorithm(): typeof VAULT_ALGORITHM {
  return VAULT_ALGORITHM;
}
