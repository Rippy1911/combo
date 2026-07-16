export { VAULT_ALGORITHM, getVaultAlgorithm } from "./constants.js";
export type { VaultEntry } from "./types.js";
export { VaultEntrySchema } from "./types.js";
export {
  setPassphrase,
  unlock,
  lock,
  put,
  get,
  list,
  deleteEntry,
  isUnlocked,
  exportEncrypted,
  isInitialized,
  _resetForTests,
} from "./vault.js";
