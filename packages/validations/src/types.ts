import { z } from "zod";

export const CreateUserSchema = z.object({
  name: z.string().min(3, "Name is required").max(50, "Name is too long"),
  email: z.email(),
  password: z
    .string()
    .min(8, "Password is too short")
    .max(50, "Password is too long"),
});

export const SigninSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8, "Password is too short")
    .max(50, "Password is too long"),
});

export const RoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(50, "Name is too long"),
    sceneId: z.string().min(1),
  })
  .strict();

export const InviteSchema = z
  .object({
    email: z.email().trim().toLowerCase(),
    role: z.enum(["editor", "viewer"]).default("editor"),
  })
  .strict();

export const RoomRoleSchema = z.enum(["editor", "viewer"]);

export const JoinCodeSchema = z
  .object({ role: RoomRoleSchema.default("editor") })
  .strict();

export const UpdateRoomMemberSchema = z
  .object({ role: RoomRoleSchema })
  .strict();

export const RoomJoinCodeInputSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/));

const SceneDataSchema = z
  .object({
    elements: z.array(z.json()),
    appState: z.record(z.string(), z.json()).optional(),
    files: z.record(z.string(), z.json()).optional(),
  })
  .loose();

export const CreateSceneSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    data: SceneDataSchema,
  })
  .strict();

export const UpdateSceneSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    data: SceneDataSchema.optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.data !== undefined, {
    message: "At least one of title or data must be provided",
  });
