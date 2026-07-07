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
});

// Formats in the visitor's own locale + timezone. Must be a client island: the SSR
// server (Cloudflare Workers) only knows UTC. suppressHydrationWarning silences the
// expected server-vs-client text difference.
export default function LocalDateTime({ iso, className }: LocalDateTimeProps) {
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {formatter.format(new Date(iso))}
    </time>
  );
}
