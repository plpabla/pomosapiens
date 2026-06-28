import { z } from "zod";

export const createSessionSchema = z.object({
  energy_level: z.enum(["low", "medium", "high"], {
    message: "energy_level must be low, medium, or high",
  }),
  topic_id: z.uuid({ message: "topic_id must be a valid UUID" }).nullable().optional(),
  material_format_id: z.uuid({ message: "material_format_id must be a valid UUID" }).nullable().optional(),
});

export const endSessionSchema = z.object({
  focus_rating: z
    .number()
    .int()
    .min(1, "focus_rating must be between 1 and 5")
    .max(5, "focus_rating must be between 1 and 5")
    .nullable(),
  ended_at: z.iso.datetime({ message: "ended_at must be a valid ISO-8601 datetime" }),
});

export type CreateSessionPayload = z.infer<typeof createSessionSchema>;
export type EndSessionPayload = z.infer<typeof endSessionSchema>;
