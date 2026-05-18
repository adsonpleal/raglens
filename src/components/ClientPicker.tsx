import type { ClientInfo } from "../lib/types";

type Props = {
  clients: ClientInfo[];
  selectedPid: number | null;
  onSelect: (pid: number) => void;
  emptyMessage: string;
};

export function ClientPicker({
  clients,
  selectedPid,
  onSelect,
  emptyMessage,
}: Props) {
  // Hide entries with no resolved PID — they can't be selected anyway,
  // and the noisy "PID desconhecido" row is more distracting than useful.
  const visible = clients.filter((c) => c.pid !== null);
  if (visible.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <ul className="client-list">
      {visible.map((c) => {
        const pid = c.pid as number;
        const isSelected = pid === selectedPid;
        const label = buildLabel(c);
        return (
          <li key={pid} className={isSelected ? "selected" : ""}>
            <label>
              <input
                type="radio"
                name="client"
                checked={isSelected}
                onChange={() => onSelect(pid)}
              />
              <div className="client-meta">
                <div className="client-primary">{label.primary}</div>
                <div className="client-secondary muted">{label.secondary}</div>
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function buildLabel(c: ClientInfo): { primary: string; secondary: string } {
  const primary = c.name ?? `Cliente · PID ${c.pid}`;
  const parts: string[] = [];
  if (c.name && c.pid !== null) parts.push(`PID ${c.pid}`);
  if (c.aid !== null) parts.push(`AID ${c.aid}`);
  if (c.process_name) parts.push(c.process_name);
  if (c.process_creation_unix_ms !== null) {
    parts.push(`aberto às ${formatTime(c.process_creation_unix_ms)}`);
  }
  parts.push(`${c.connection_count} conexões`);
  return { primary, secondary: parts.join(" · ") };
}

function formatTime(unixMs: number): string {
  const d = new Date(unixMs);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
