// Fires one fetch against GitHub's releases/latest when MainWindow
// mounts. If the reported tag is strictly newer than what we're
// running AND newer than whatever the user last dismissed, expose it
// so the banner renders. Dismissal writes the tag into the store so
// it doesn't reappear until an even newer release lands.

import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  getDismissedUpdateVersion,
  setDismissedUpdateVersion,
} from "../lib/store";
import { fetchLatestRelease, isNewer, type ReleaseInfo } from "../lib/updates";

export type UpdateState = {
  available: ReleaseInfo | null;
  dismiss: () => void;
};

export function useLatestRelease(): UpdateState {
  const [available, setAvailable] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [current, latest, dismissed] = await Promise.all([
        getVersion(),
        fetchLatestRelease(),
        getDismissedUpdateVersion(),
      ]);
      if (cancelled || !latest) return;
      if (!isNewer(latest.tagName, current)) return;
      if (dismissed && !isNewer(latest.tagName, dismissed)) return;
      setAvailable(latest);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(async () => {
    if (!available) return;
    await setDismissedUpdateVersion(available.tagName);
    setAvailable(null);
  }, [available]);

  return { available, dismiss };
}
