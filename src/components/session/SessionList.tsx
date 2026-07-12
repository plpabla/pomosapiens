import { Card } from "@/components/ui/card";
import SessionTile from "@/components/session/SessionTile";
import type { SessionListItem } from "@/lib/types";

interface Props {
  sessions: SessionListItem[];
  error: string | null;
  readOnly?: boolean;
}

export default function SessionList({ sessions, error, readOnly = false }: Props) {
  if (error) {
    return <div className="border-spark/40 bg-crimson/40 text-spark rounded-lg border px-4 py-3 text-sm">{error}</div>;
  }

  if (sessions.length === 0) {
    return (
      <Card className="border-charred bg-transparent p-6 text-center shadow-none">
        <p className="text-ash text-sm">No sessions yet. Start your first one above.</p>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {sessions.map((session) => (
        <li key={session.id}>
          <SessionTile session={session} readOnly={readOnly} />
        </li>
      ))}
    </ul>
  );
}
