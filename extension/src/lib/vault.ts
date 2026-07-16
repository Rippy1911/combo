import { Vault } from "@combo/vault";

/**
 * Side-panel vault singleton.
 *
 * The vault lives in the side panel context (Web Crypto + IndexedDB are both
 * available here). The KEK is held only in memory for the unlocked session and
 * is dropped on window unload so secrets never persist unlocked.
 */
let vault: Vault | null = null;

export function getVault(): Vault {
  if (!vault) {
    vault = new Vault({
      addEventListener: (type, listener) => window.addEventListener(type, listener),
    });
  }
  return vault;
}

/** Vault labels used by the side panel. */
export const VAULT_LABEL_OPENROUTER_KEY = "openrouter-key";
export const VAULT_LABEL_OPENROUTER_MODEL = "openrouter-model";
