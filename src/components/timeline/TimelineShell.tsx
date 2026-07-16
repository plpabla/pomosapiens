import type { ReactNode } from "react";
import TimelineHeader from "@/components/timeline/TimelineHeader";

interface TimelineShellProps {
  children?: ReactNode;
}

export default function TimelineShell({ children }: TimelineShellProps) {
  return (
    <div className="bg-cosmic flex-1 p-4">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <TimelineHeader />
        {children}
      </div>
    </div>
  );
}
