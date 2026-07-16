const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const VERIFICATION_PLAINTEXT = "combo-vault-verification-v1";

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    diff |= ai ^ bi;
  }
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateSalt(): Promise<Uint8Array> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  return salt;
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

export async function decrypt(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const ivBytes = fromBase64(iv);
  const cipherBytes = fromBase64(ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBytes) as BufferSource },
    key,
    new Uint8Array(cipherBytes) as BufferSource,
  );
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function createVerificationBlob(
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string; digest: string }> {
  const { ciphertext, iv } = await encrypt(key, VERIFICATION_PLAINTEXT);
  const encoder = new TextEncoder();
  const digestBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(VERIFICATION_PLAINTEXT),
  );
  return {
    ciphertext,
    iv,
    digest: toBase64(new Uint8Array(digestBuffer)),
  };
}

export async function verifyKey(
  key: CryptoKey,
  ciphertext: string,
  iv: string,
  expectedDigest: string,
): Promise<boolean> {
  try {
    const plaintext = await decrypt(key, ciphertext, iv);
    const encoder = new TextEncoder();
    const digestBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
    const actualDigest = new Uint8Array(digestBuffer);
    const expected = fromBase64(expectedDigest);
    return timingSafeEqual(actualDigest, expected);
  } catch {
    return false;
  }
}

export { toBase64, fromBase64, PBKDF2_ITERATIONS, VERIFICATION_PLAINTEXT };
