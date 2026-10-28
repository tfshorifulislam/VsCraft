const UNIT_TO_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
} as const;

type DurationUnit = keyof typeof UNIT_TO_MS;

export const parseDurationMs = (value: string): number => {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());

  if (match === null) {
    throw new Error(`Invalid duration "${value}"; expected a value such as 15m or 7d`);
  }

  const amount = Number(match[1]);
  const unit = match[2] as DurationUnit;

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`Invalid duration "${value}"`);
  }

  return amount * UNIT_TO_MS[unit];
};
