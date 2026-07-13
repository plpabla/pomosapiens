import ResumeButton from "@/components/dashboard/ResumeButton";
import AbandonButton from "@/components/dashboard/AbandonButton";

interface Props {
  sessionId: string;
}

export default function InProgressSessionActions({ sessionId }: Props) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <ResumeButton sessionId={sessionId} />
      </div>
      <div className="flex-1">
        <AbandonButton sessionId={sessionId} />
      </div>
    </div>
  );
}
