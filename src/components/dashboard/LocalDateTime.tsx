import { useSyncExternalStore } from "react";

interface LocalDateTimeProps {
  iso: string;
  className?: string;
}

const formatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function subscribe() {
  return () => undefined;
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

// Formats in the visitor's own timezone using a forced 24-hour clock. The SSR server
// (Cloudflare Workers) runs in UTC, so any server-produced value would be wrong. The
// mount gate below keeps this client-only even when nested inside a client:load island
// (Astro client directives only apply to components used directly in .astro files, not
// to nested framework children) -- render nothing until mounted, then fill in local time.
export default function LocalDateTime({ iso, className }: LocalDateTimeProps) {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!mounted) return null;

  return (
    <time dateTime={iso} className={className}>
      {formatter.format(new Date(iso))}
    </time>
  );
}
