export type EnergyLevel = "low" | "medium" | "high";
export type Mode = "preset_1" | "preset_2" | "preset_3" | "count_up";

export interface Topic {
  id: string;
  name: string;
  archived_at: string | null;
}

export interface MaterialFormat {
  id: string;
  name: string;
  owner_id: string | null;
  archived_at: string | null;
}

export interface Preset {
  slot: 1 | 2 | 3;
  focus_seconds: number;
  break_seconds: number;
}
