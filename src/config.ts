import type { RuntimeLimits } from "./types";

const DEFAULT_LIMITS: RuntimeLimits = {
  maxHtmlBytes: 5 * 1024 * 1024,
  maxVersions: 20,
};

type LimitEnv = Partial<
  Record<"MAX_HTML_BYTES" | "MAX_VERSIONS", string>
>;

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function readLimits(env: LimitEnv): RuntimeLimits {
  return {
    maxHtmlBytes: readPositiveInteger(
      env.MAX_HTML_BYTES,
      DEFAULT_LIMITS.maxHtmlBytes,
    ),
    maxVersions: readPositiveInteger(
      env.MAX_VERSIONS,
      DEFAULT_LIMITS.maxVersions,
    ),
  };
}
