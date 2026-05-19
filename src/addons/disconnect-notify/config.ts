// Persistent config for the disconnect-notify addon. Stored under
// `addon.disconnect-notify.config` via the shared store helpers.
//
// Both channel masters default to false so the user opts in
// explicitly — mirrors the pet-feeder behaviour. All three Rust-side
// disconnect kinds (RST / timeout / BAN) collapse into one
// "Disconnected from server" notification, so there is no per-kind
// matrix here.

export type DisconnectNotifyConfig = {
  /** Master toggle for ntfy.sh push. When off, no push fires. */
  pushEnabled: boolean;
  pushNtfyTopic: string;
  /** Master toggle for native Windows toasts. */
  winEnabled: boolean;
};

export const disconnectNotifyDefaultConfig: DisconnectNotifyConfig = {
  pushEnabled: false,
  pushNtfyTopic: "",
  winEnabled: false,
};
