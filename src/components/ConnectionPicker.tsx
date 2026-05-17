import {
  fourTupleKey,
  type ConnectionInfo,
  type FourTuple,
} from "../lib/types";

type Props = {
  connections: ConnectionInfo[];
  selected: FourTuple | null;
  onSelect: (ft: FourTuple) => void;
  emptyMessage: string;
};

export function ConnectionPicker({
  connections,
  selected,
  onSelect,
  emptyMessage,
}: Props) {
  if (connections.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }
  const selectedKey = selected ? fourTupleKey(selected) : null;
  return (
    <ul className="connection-list">
      {connections.map((c) => {
        const key = fourTupleKey(c.four_tuple);
        const isSelected = key === selectedKey;
        return (
          <li key={key} className={isSelected ? "selected" : ""}>
            <label>
              <input
                type="radio"
                name="connection"
                checked={isSelected}
                onChange={() => onSelect(c.four_tuple)}
              />
              <code>
                {c.four_tuple.client_ip}:{c.four_tuple.client_port}
                {" "}↔{" "}
                {c.four_tuple.server_ip}:{c.four_tuple.server_port}
              </code>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
