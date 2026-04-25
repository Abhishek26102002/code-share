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
