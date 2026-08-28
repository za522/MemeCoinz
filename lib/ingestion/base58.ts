const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_INDEX = new Map(
  [...ALPHABET].map((character, index) => [character, index]),
);

export function decodeBase58(value: string): Uint8Array | null {
  if (!value) return new Uint8Array();
  let number = BigInt(0);
  for (const character of value) {
    const digit = ALPHABET_INDEX.get(character);
    if (digit === undefined) return null;
    number = number * BigInt(58) + BigInt(digit);
  }

  const bytes: number[] = [];
  while (number > BigInt(0)) {
    bytes.push(Number(number & BigInt(255)));
    number >>= BigInt(8);
  }
  bytes.reverse();

  let leadingZeros = 0;
  while (leadingZeros < value.length && value[leadingZeros] === "1") {
    leadingZeros += 1;
  }
  return Uint8Array.from([
    ...new Array<number>(leadingZeros).fill(0),
    ...bytes,
  ]);
}

export function encodeBase58(bytes: Uint8Array): string {
  let number = BigInt(0);
  for (const byte of bytes) number = (number << BigInt(8)) | BigInt(byte);

  let encoded = "";
  while (number > BigInt(0)) {
    const remainder = Number(number % BigInt(58));
    number /= BigInt(58);
    encoded = ALPHABET[remainder] + encoded;
  }

  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros += 1;
  }
  return "1".repeat(leadingZeros) + encoded;
}
