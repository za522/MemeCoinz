/**
 * Constants copied from Pump's official public IDLs.
 *
 * Source of truth:
 * https://github.com/pump-fun/pump-public-docs/tree/main/idl
 * Keep discriminator changes reviewable: discovery must never infer a launch
 * from a generic transaction that merely touched a Pump program.
 */
export const PUMP_PROGRAM_ID =
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_AMM_PROGRAM_ID =
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112";

export const PUMP_DISCRIMINATORS = {
  create: [24, 30, 200, 40, 5, 28, 7, 119],
  createV2: [214, 144, 76, 236, 95, 139, 49, 180],
  buy: [102, 6, 61, 18, 1, 218, 235, 234],
  buyV2: [184, 23, 238, 97, 103, 197, 211, 61],
  sell: [51, 230, 133, 164, 1, 127, 131, 173],
  sellV2: [93, 246, 130, 60, 231, 233, 64, 178],
  migrate: [155, 234, 231, 146, 236, 158, 162, 30],
  createPool: [233, 146, 209, 142, 207, 104, 64, 188],
  pumpSwapBuyExactQuoteIn: [198, 46, 21, 82, 180, 217, 232, 112],
} as const;

export type PumpInstructionKind = keyof typeof PUMP_DISCRIMINATORS;

export function instructionKind(bytes: Uint8Array): PumpInstructionKind | null {
  if (bytes.length < 8) return null;
  for (const [kind, discriminator] of Object.entries(PUMP_DISCRIMINATORS)) {
    if (discriminator.every((byte, index) => bytes[index] === byte)) {
      return kind as PumpInstructionKind;
    }
  }
  return null;
}
