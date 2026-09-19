const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const randomLetters = (length: number) => {
  const values = crypto.getRandomValues(new Uint8Array(length));
  let result = "";

  for (const value of values) {
    result += ALPHABET[value % ALPHABET.length];
  }

  return result;
};

export const createRoomId = () => randomLetters(5);

export const createRoomKey = () => randomLetters(12);

export const buildRoomUrl = (roomId: string, roomKey: string) =>
  `/${roomId}#${roomKey}`;

export const ANONYMOUS_ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type ExpiryChoice = "never" | "24h" | "7d" | "30d";

export const EXPIRY_CHOICES: { value: ExpiryChoice; label: string; hint: string }[] = [
  { value: "never", label: "Never", hint: "Keep until you delete it" },
  { value: "24h", label: "24 hours", hint: "Same as a link-only room" },
  { value: "7d", label: "7 days", hint: "Good for a review cycle" },
  { value: "30d", label: "30 days", hint: "Good for a project" }
];

const EXPIRY_DURATIONS_MS: Record<Exclude<ExpiryChoice, "never">, number> = {
  "24h": ANONYMOUS_ROOM_LIFETIME_MS,
  "7d": 7 * ANONYMOUS_ROOM_LIFETIME_MS,
  "30d": 30 * ANONYMOUS_ROOM_LIFETIME_MS
};

export const expiryChoiceToTimestamp = (choice: ExpiryChoice) =>
  choice === "never"
    ? null
    : new Date(Date.now() + EXPIRY_DURATIONS_MS[choice]).toISOString();

export const isExpired = (expiresAt: string | null) =>
  expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();

export const describeExpiry = (expiresAt: string | null) => {
  if (expiresAt === null) {
    return "Never expires";
  }

  const remainingMs = new Date(expiresAt).getTime() - Date.now();

  if (remainingMs <= 0) {
    return "Expired";
  }

  const hours = Math.round(remainingMs / (60 * 60 * 1000));

  if (hours < 24) {
    return `Expires in ${Math.max(1, hours)}h`;
  }

  return `Expires in ${Math.round(hours / 24)}d`;
};
