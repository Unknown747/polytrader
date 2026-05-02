import db from "./db";

export type NetworkMode = "mainnet" | "testnet";

const KEY = "NETWORK_MODE";

export function getNetworkMode(): NetworkMode {
  const row = db.prepare("SELECT value FROM bot_state WHERE key = ?").get(KEY) as { value: string } | undefined;
  const val = row?.value;
  if (val === "testnet") return "testnet";
  return "mainnet";
}

export function setNetworkMode(mode: NetworkMode): void {
  db.prepare("INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)").run(KEY, mode);
}
