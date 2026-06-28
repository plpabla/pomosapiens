import { z } from "zod";

export const createTopicSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100, "name too long"),
});

export const updateTopicSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(100, "name too long").optional(),
    archived_at: z.iso.datetime({ message: "archived_at must be a valid ISO-8601 datetime" }).nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.archived_at !== undefined, {
    message: "at least one of name or archived_at is required",
  });

export type CreateTopicPayload = z.infer<typeof createTopicSchema>;
export type UpdateTopicPayload = z.infer<typeof updateTopicSchema>;
