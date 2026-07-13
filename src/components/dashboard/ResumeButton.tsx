import { Button } from "@/components/ui/button";

interface Props {
  sessionId: string;
}

export default function ResumeButton({ sessionId }: Props) {
  return (
    <Button
      type="button"
      size="sm"
      className="w-full"
      onClick={() => {
        window.location.assign(`/session/${sessionId}`);
      }}
    >
      <span aria-hidden="true">➤</span>
      Resume
    </Button>
  );
}
