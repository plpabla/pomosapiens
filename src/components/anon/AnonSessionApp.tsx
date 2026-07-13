import { useState } from "react";
import SessionStartForm from "@/components/session/SessionStartForm";
import SessionRunner from "@/components/session/SessionRunner";
import SessionList from "@/components/session/SessionList";
import FocusRatingChart from "@/components/dashboard/FocusRatingChart";
import InlineTopicCreate from "@/components/anon/InlineTopicCreate";
import ClearHistoryButton from "@/components/anon/ClearHistoryButton";
import { useLocalTopics } from "@/lib/local/localTopics";
import { useLocalSessions, type LocalSession } from "@/lib/local/localSessions";
import { LOCAL_DEFAULT_FORMATS } from "@/lib/local/localCatalog";
import { localPersistence } from "@/lib/local/localPersistence";
import { toSessionListItems } from "@/lib/local/localSessionList";
import { useSessionStart } from "@/lib/session/useSessionStart";
import { useLastMode } from "@/lib/session/useLastMode";
import { isRated } from "@/lib/session/format";
import { DEFAULT_PRESETS } from "@/lib/timer/preset-defaults";
import type { EnergyLevel } from "@/lib/types";

interface RunnerState {
  sessionId: string;
  startedAtMs: number;
  focusSeconds: number;
  mode: "preset" | "count_up";
  breakSeconds: number | null;
}

function toRunnerState(row: LocalSession): RunnerState {
  const mode = row.timer_mode === "count_up" ? "count_up" : "preset";
  return {
    sessionId: row.id,
    startedAtMs: Date.parse(row.started_at),
    focusSeconds: row.planned_focus_seconds ?? 25 * 60,
    mode,
    breakSeconds: mode === "count_up" ? null : (row.planned_break_seconds ?? 0),
  };
}

export default function AnonSessionApp() {
  const sessions = useLocalSessions();
  const topics = useLocalTopics();
  const [energy, setEnergy] = useState<EnergyLevel | null>("medium");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [materialFormatId, setMaterialFormatId] = useState<string | null>(null);
  const [mode, persistMode] = useLastMode();

  // Resume detection: `sessions` starts as the frozen server snapshot and is
  // upgraded to the real client read by useSyncExternalStore's own resync --
  // reacting to that reference change here (render-time, not an effect) picks
  // up a pre-existing in-progress row without a hydration mismatch.
  const [startedSessionId, setStartedSessionId] = useState<string | null>(null);
  const [prevSessions, setPrevSessions] = useState<readonly LocalSession[] | null>(null);
  if (sessions !== prevSessions) {
    setPrevSessions(sessions);
    if (startedSessionId === null) {
      const resumedRow = sessions.find((s) => s.ended_at === null);
      if (resumedRow) setStartedSessionId(resumedRow.id);
    }
  }

  // The row's ended_at flips to non-null once rated, but the runner (and its
  // own "session saved" screen) must stay mounted until the user explicitly
  // leaves -- so lookup is by id, not by in-progress status.
  const activeRow = startedSessionId ? (sessions.find((s) => s.id === startedSessionId) ?? null) : null;

  function resetForm() {
    setEnergy("medium");
    setTopicId(null);
    setMaterialFormatId(null);
    setStartedSessionId(null);
  }

  const { submitting, error, handleSubmit } = useSessionStart({
    energy,
    topicId,
    materialFormatId,
    mode,
    presets: [...DEFAULT_PRESETS],
    persistence: localPersistence,
    onStarted: (result) => {
      setStartedSessionId(result.id);
    },
  });

  if (activeRow) {
    const runnerState = toRunnerState(activeRow);
    return (
      <SessionRunner
        sessionId={runnerState.sessionId}
        startedAtMs={runnerState.startedAtMs}
        focusSeconds={runnerState.focusSeconds}
        mode={runnerState.mode}
        breakSeconds={runnerState.breakSeconds}
        persistEnd={(args) => localPersistence.endSession(runnerState.sessionId, args)}
        canContinue={false}
        onGoToDashboard={resetForm}
        onStartNewSession={resetForm}
        fullHeight={false}
      />
    );
  }

  const historyItems = toSessionListItems(sessions, topics);
  const ratedSessions = historyItems
    .filter(isRated)
    .map((s) => ({ started_at: s.started_at, focus_rating: s.focus_rating }))
    .reverse();

  return (
    <>
      <SessionStartForm
        presets={[...DEFAULT_PRESETS]}
        topics={[...topics]}
        formats={LOCAL_DEFAULT_FORMATS}
        mode={mode}
        onModeChange={persistMode}
        energy={energy}
        onEnergyChange={setEnergy}
        topicId={topicId}
        onTopicChange={setTopicId}
        materialFormatId={materialFormatId}
        onFormatChange={setMaterialFormatId}
        loadError={null}
        submitError={error}
        submitting={submitting}
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        topicSlot={
          <InlineTopicCreate
            onCreated={(topic) => {
              setTopicId(topic.id);
            }}
          />
        }
      />
      {historyItems.length > 0 && (
        <div className="mx-auto mt-8 max-w-2xl text-left">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-off-white text-xl font-semibold">History</h2>
            <ClearHistoryButton />
          </div>
          <div className="mb-6">
            <FocusRatingChart sessions={ratedSessions} />
          </div>
          <SessionList readOnly sessions={historyItems} error={null} />
        </div>
      )}
    </>
  );
}
