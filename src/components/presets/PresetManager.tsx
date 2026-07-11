import { ServerError } from "@/components/auth/ServerError";
import PresetRow from "@/components/presets/PresetRow";
import { usePresetEditor } from "@/lib/session/usePresetEditor";

export default function PresetManager() {
  const { presets, loadError, rows, setRow, handleSave } = usePresetEditor();

  if (loadError) return <ServerError message={loadError} />;

  return (
    <div className="space-y-4">
      {presets.map((preset, i) => (
        <PresetRow
          key={preset.slot}
          preset={preset}
          row={rows[i]}
          onFocusChange={(value) => {
            setRow(i, { focusMin: value });
          }}
          onBreakChange={(value) => {
            setRow(i, { breakMin: value });
          }}
          onSave={() => void handleSave(i)}
        />
      ))}
    </div>
  );
}
