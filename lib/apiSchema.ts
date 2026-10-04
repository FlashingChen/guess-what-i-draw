import { z } from "zod";

/** 一张 1024 PNG 线稿大约 50–150 KB，这里给足余量（DeepSeek 单图上限 32 MiB）。 */
export const MAX_IMAGE_CHARS = 48 * 1024 * 1024;

export const ImageDataUrl = z
  .string()
  .max(MAX_IMAGE_CHARS)
  .regex(/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/, "图片格式不对");

/**
 * 客户端只把 role / kind / text 发上来，id 和 createdAt 是纯 UI 字段，不参与校验。
 * kind 里 error 也要收：它代表一条失败气泡，但不会进模型上下文（见 deepseek.ts 的过滤）。
 */
export const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  kind: z.enum(["guess", "text", "hint", "error"]),
  text: z.string().max(4000),
});

export const GuessRequest = z.object({
  image: ImageDataUrl,
  turns: z.array(TurnSchema).max(80).default([]),
});

export const ChatRequest = z.object({
  message: z.string().min(1).max(2000),
  image: ImageDataUrl.optional(),
  turns: z.array(TurnSchema).max(80).default([]),
  think: z.boolean().default(false),
});
