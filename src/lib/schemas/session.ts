import { z } from "zod";

export const createSessionSchema = z.object({
  energy_level: z.enum(["low", "medium", "high"], {
    message: "energy_level must be low, medium, or high",
  }),
  topic_id: z.uuid({ message: "topic_id must be a valid UUID" }).nullable().optional(),
  material_format_id: z.uuid({ message: "material_format_id must be a valid UUID" }).nullable().optional(),
  timer_mode: z.enum(["preset_1", "preset_2", "preset_3", "count_up"]),
  planned_focus_seconds: z
    .number()
    .int()
    .min(60)
    .max(4 * 60 * 60)
    .nullable(),
  planned_break_seconds: z
    .number()
    .int()
    .min(0)
    .max(60 * 60)
    .nullable(),
});

export const endSessionSchema = z.object({
  focus_rating: z
    .number()
    .int()
    .min(1, "focus_rating must be between 1 and 5")
    .max(5, "focus_rating must be between 1 and 5")
    .nullable(),
  ended_at: z.iso.datetime({ message: "ended_at must be a valid ISO-8601 datetime" }),
  note: z
    .string()
    .trim()
    .max(500, "note must be at most 500 characters")
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
});

export const editSessionSchema = z.object({
  duration_seconds: z
    .number()
    .int()
    .min(1, "duration_seconds must be at least 1")
    .max(24 * 60 * 60, "duration_seconds must be at most 24 hours"),
  energy_level: z.enum(["low", "medium", "high"], {
    message: "energy_level must be low, medium, or high",
  }),
  topic_id: z.uuid({ message: "topic_id must be a valid UUID" }).nullable().optional(),
  material_format_id: z.uuid({ message: "material_format_id must be a valid UUID" }).nullable().optional(),
  focus_rating: z
    .number()
    .int()
    .min(1, "focus_rating must be between 1 and 5")
    .max(5, "focus_rating must be between 1 and 5")
    .nullable(),
  note: z
    .string()
    .trim()
    .max(500, "note must be at most 500 characters")
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
});

export type CreateSessionPayload = z.infer<typeof createSessionSchema>;
export type EndSessionPayload = z.infer<typeof endSessionSchema>;
export type EditSessionPayload = z.infer<typeof editSessionSchema>;
