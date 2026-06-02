export type AppRoute =
  | { kind: "home" }
  | { kind: "create" }
  | { kind: "skill" }
  | { kind: "update"; period: string; pageId: string }
  | { kind: "share"; period: string; pageId: string; version: number | null; assetPath: string }
  | { kind: "notFound" };

const PERIOD_PATTERN = /^\d{6}$/;
const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function validPeriod(period: string): boolean {
  return PERIOD_PATTERN.test(period);
}

function validPageId(pageId: string): boolean {
  return PAGE_ID_PATTERN.test(pageId);
}

export function parseRoute(url: URL): AppRoute {
  const segments = url.pathname.split("/");
  const parts = segments.slice(1);

  if (url.pathname === "/") {
    return { kind: "home" };
  }

  if (parts.length === 1 && parts[0] === "app") {
    return { kind: "create" };
  }

  if (parts.length === 1 && parts[0] === "SKILL.md") {
    return { kind: "skill" };
  }

  if (parts.length === 4 && parts[0] === "app" && parts[3] === "versions") {
    const [, period, pageId] = parts;
    if (period !== undefined && pageId !== undefined && validPeriod(period) && validPageId(pageId)) {
      return { kind: "update", period, pageId };
    }
  }

  if (parts[0] === "s" && parts.length >= 3) {
    const period = parts[1];
    const pageId = parts[2];

    if (period === undefined || pageId === undefined || period === "" || pageId === "") {
      return { kind: "notFound" };
    }

    if (!validPeriod(period) || !validPageId(pageId)) {
      return { kind: "notFound" };
    }

    const rest = parts.slice(3);

    if (rest[0] === "versions") {
      const versionText = rest[1];
      if (versionText === undefined || !/^\d+$/.test(versionText)) {
        return { kind: "notFound" };
      }

      return {
        kind: "share",
        period,
        pageId,
        version: Number(versionText),
        assetPath: rest.slice(2).join("/"),
      };
    }

    return { kind: "share", period, pageId, version: null, assetPath: rest.join("/") };
  }

  return { kind: "notFound" };
}
