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

// Formats in the visitor's own timezone using a forced 24-hour clock. Must be rendered
// client-only (client:only="react"): the SSR server (Cloudflare Workers) runs in UTC, so
// any server-produced value would be wrong. Rendering only in the browser guarantees the
// visitor's local timezone.
export default function LocalDateTime({ iso, className }: LocalDateTimeProps) {
  return (
    <time dateTime={iso} className={className}>
      {formatter.format(new Date(iso))}
    </time>
  );
}
