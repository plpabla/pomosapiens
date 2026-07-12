import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServerError } from "@/components/auth/ServerError";
import { createLocalTopic } from "@/lib/local/localTopics";
import type { Topic } from "@/lib/types";

interface Props {
  onCreated: (topic: Topic) => void;
}

export default function InlineTopicCreate({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        New topic
      </Button>
    );
  }

  function handleConfirm() {
    setError(null);
    try {
      const topic = createLocalTopic(name);
      setOpen(false);
      setName("");
      onCreated(topic);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create topic");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Topic name"
        />
        <Button type="button" size="sm" onClick={handleConfirm}>
          Confirm
        </Button>
      </div>
      <ServerError message={error} />
    </div>
  );
}
