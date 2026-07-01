import { z } from "zod";

export const updateUserPresetSchema = z.object({
  focus_seconds: z
    .number()
    .int()
    .min(60)
    .max(4 * 60 * 60),
  break_seconds: z
    .number()
    .int()
    .min(0)
    .max(60 * 60),
});

export type UpdateUserPresetPayload = z.infer<typeof updateUserPresetSchema>;
