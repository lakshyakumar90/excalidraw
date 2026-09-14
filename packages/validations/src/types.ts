import { z } from "zod";

export const CreateUserSchema = z.object({
  name: z
    .string()
    .min(3, "Name is required")
    .max(50, "Name is too long"),
  email: z.email(),
  password: z
    .string()
    .min(8, "Password is too short")
    .max(50, "Password is too long"),
})

export const SigninSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8, "Password is too short")
    .max(50, "Password is too long"),
})

export const RoomSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name is too long"),
})