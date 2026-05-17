import type { NetworkInterface } from "../lib/types";

type Props = {
  interfaces: NetworkInterface[];
  selectedIp: string | null;
  onSelect: (ip: string) => void;
  disabled?: boolean;
};

export function NicPicker({ interfaces, selectedIp, onSelect, disabled }: Props) {
  return (
    <select
      className="nic-picker"
      value={selectedIp ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
    >
      <option value="" disabled>
        {interfaces.length === 0 ? "Carregando…" : "Selecione"}
      </option>
      {interfaces.map((i) => (
        <option key={`${i.index}-${i.ipv4}`} value={i.ipv4}>
          {i.name} ({i.ipv4})
        </option>
      ))}
    </select>
  );
}
