const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const importKey = async (secret: string) => {
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(secret));

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
};

export const encryptText = async (value: string, secret: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value)
  );

  return `${toBase64(iv.buffer)}.${toBase64(encrypted)}`;
};

export const decryptText = async (payload: string, secret: string) => {
  if (!payload) {
    return "";
  }

  const [ivPart, contentPart] = payload.split(".");

  if (!ivPart || !contentPart) {
    throw new Error("Invalid payload");
  }

  const key = await importKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    key,
    fromBase64(contentPart)
  );

  return decoder.decode(decrypted);
};
