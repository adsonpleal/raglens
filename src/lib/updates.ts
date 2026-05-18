// Talks to GitHub's `releases/latest` endpoint and compares the
// reported tag against the running app's version. All errors collapse
// to `null` so a flaky network never blocks the main UI.

export type ReleaseInfo = {
  tagName: string;
  htmlUrl: string;
};

const LATEST_URL =
  "https://api.github.com/repos/adsonpleal/raglens/releases/latest";

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(LATEST_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as { tag_name?: unknown }).tag_name !== "string" ||
      typeof (data as { html_url?: unknown }).html_url !== "string"
    ) {
      return null;
    }
    return {
      tagName: (data as { tag_name: string }).tag_name,
      htmlUrl: (data as { html_url: string }).html_url,
    };
  } catch {
    return null;
  }
}

/** True iff `latest` is strictly newer than `current`. Accepts either
 *  `vX.Y.Z` or `X.Y.Z`. Returns false on any parse failure so we
 *  don't pester the user with a bogus banner. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function parseVersion(v: string): [number, number, number] | null {
  const cleaned = v.replace(/^v/, "");
  const parts = cleaned.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  return parts as [number, number, number];
}
