import type { MaterialFormat } from "@/lib/types";

// Local equivalent of the server-seeded material_formats rows (see
// supabase/migrations/20260531182506_sessions_data_foundation.sql). The
// server seeds with gen_random_uuid(), so ids differ per install -- the local
// mirror needs its own fixed literals, stable across page loads, so stored
// sessions' material_format_id references stay valid.
export const LOCAL_DEFAULT_FORMATS: MaterialFormat[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Video", owner_id: null, archived_at: null },
  { id: "00000000-0000-4000-8000-000000000002", name: "Reading", owner_id: null, archived_at: null },
  { id: "00000000-0000-4000-8000-000000000003", name: "Writing code", owner_id: null, archived_at: null },
  { id: "00000000-0000-4000-8000-000000000004", name: "Drilling problems", owner_id: null, archived_at: null },
  { id: "00000000-0000-4000-8000-000000000005", name: "Other", owner_id: null, archived_at: null },
];
