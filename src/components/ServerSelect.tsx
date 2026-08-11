// The Freya/Nidhogg picker. Two places show it — the wishlist header and the
// catalogue's filter panel — and both read the same stored choice, so the widget
// lives here rather than being typed out twice.

import { SERVERS, serverLabel, useServer, type Server } from "../core/server";

export function ServerSelect({ id }: { id?: string }) {
  const [server, setServer] = useServer();
  return (
    <select
      id={id}
      className="server-select"
      value={server}
      onChange={(e) => setServer(e.target.value as Server)}
    >
      {SERVERS.map((s) => (
        <option key={s} value={s}>
          {serverLabel(s)}
        </option>
      ))}
    </select>
  );
}
