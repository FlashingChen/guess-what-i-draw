import { normalizeGuess } from "./normalize";
import {
  CHAT_SYSTEM,
  FIRST_GUESS_PROMPT,
  GUESS_SYSTEM,
  PREVIOUS_DRAWING_PROMPT,
  REGUESS_PROMPT,
} from "./prompts";
import type { ChatTurn } from "@/types";

/**
 * DeepSeek 服务端封装。这是唯一持有 API Key 的地方，绝不能被客户端组件 import。
 *
 * 关键事实（已核对官方文档，见 PRD §4.3）：
 *   - 只有 deepseek-flash 支持图片输入，deepseek-v4-pro 不支持，换模型整个产品就废了；
 *   - 图片只能出现在 user 消息里，system / assistant 带图会直接 400；
 *   - 思考模式默认开启且 effort=high，猜词必须显式关掉，否则一个词要等十几秒。
 */

const BASE_URL = "https://api.deepseek.com";
const MODEL = "deepseek-flash";
const TIMEOUT_MS = 30_000;
/** 流式对话允许更久：整个回答的生成时间都算在内。 */
const CHAT_TIMEOUT_MS = 120_000;

export type ErrorCode =
  | "MISSING_KEY"
  | "UPSTREAM_AUTH"
  | "UPSTREAM_QUOTA"
  | "UPSTREAM_RATE_LIMIT"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_REJECTED"
  | "UPSTREAM_ERROR"
  | "BAD_UPSTREAM_RESPONSE";

/** 带用户可读文案的错误。message 会直接被前端展示，所以必须是人话。 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly detail: string | undefined;

  constructor(code: ErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.detail = detail;
  }
}

type WireMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } }
      >;
    };

function readApiKey(): string {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new ApiError(
      "MISSING_KEY",
      "服务端没有读到 DEEPSEEK_API_KEY，检查一下 .env.local",
    );
  }
  return apiKey;
}

/**
 * 拼出猜词请求的消息数组。
 *
 * 只有「猜测」轮会进入历史 —— 错误块之类的 UI 状态不该污染上下文。
 * 历史轮一律只带文本：每个历史 user 消息当年确实带了图，但重发那些图既浪费
 * token 也没有额外信息量，当前这张最新图才是判断依据。
 */
export function buildGuessMessages(image: string, turns: ChatTurn[]): WireMessage[] {
  const previousGuesses = turns.filter((turn) => turn.kind === "guess");
  const messages: WireMessage[] = [{ role: "system", content: GUESS_SYSTEM }];

  for (const turn of previousGuesses) {
    messages.push({ role: "user", content: PREVIOUS_DRAWING_PROMPT });
    messages.push({ role: "assistant", content: turn.text });
  }

  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: previousGuesses.length > 0 ? REGUESS_PROMPT : FIRST_GUESS_PROMPT,
      },
      // detail: high 保留原图清晰度。我们导出的是 1024×1024 线稿，
      // 模型侧封顶 1024 token，成本约 0.002 元，没必要为省这点钱牺牲识别率。
      { type: "image_url", image_url: { url: image, detail: "high" } },
    ],
  });

  return messages;
}

function upstreamError(status: number, detail: string): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError("UPSTREAM_AUTH", "API Key 好像不对，检查一下 .env.local", detail);
  }
  if (status === 402) {
    return new ApiError("UPSTREAM_QUOTA", "DeepSeek 账户余额不足了", detail);
  }
  if (status === 429) {
    return new ApiError("UPSTREAM_RATE_LIMIT", "请求太频繁了，缓一下再试", detail);
  }
  if (status === 400 || status === 422) {
    return new ApiError("UPSTREAM_REJECTED", "AI 拒绝了这次请求，再试一次？", detail);
  }
  return new ApiError("UPSTREAM_ERROR", "AI 开小差了，再试一次？", `HTTP ${status} ${detail}`);
}

export async function guessDrawing(input: {
  image: string;
  turns: ChatTurn[];
}): Promise<string> {
  const apiKey = readApiKey();

  const body = {
    model: MODEL,
    messages: buildGuessMessages(input.image, input.turns),
    // 关掉思考模式：猜词不需要长推理，延迟才是体验的关键
    thinking: { type: "disabled" },
    // 一个词只要几个 token，给个短上限顺带压制模型长篇大论的冲动
    max_tokens: 64,
    stream: false,
  };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ApiError("UPSTREAM_TIMEOUT", "AI 想了太久，再试一次？");
    }
    throw new ApiError("UPSTREAM_ERROR", "网络好像断了，检查一下连接");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw upstreamError(res.status, detail.slice(0, 400));
  }

  const data: unknown = await res.json().catch(() => null);
  const content = extractContent(data);
  if (!content) {
    throw new ApiError(
      "BAD_UPSTREAM_RESPONSE",
      "AI 没说出答案，再试一次？",
      JSON.stringify(data)?.slice(0, 400),
    );
  }

  const guess = normalizeGuess(content);
  if (!guess) {
    throw new ApiError("BAD_UPSTREAM_RESPONSE", "AI 没说出答案，再试一次？", content.slice(0, 200));
  }
  return guess;
}

function extractContent(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return "";
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content.trim() : "";
}

/**
 * 拼出聊天请求的消息数组。
 *
 * 与猜词一样，历史里图片只出现在当前这一条 user 消息上：
 * 更早的轮次当年也带了图，但重发既费 token 又不会提供额外信息，
 * 当前画面才是回答的依据（F-4.4）。
 */
export function buildChatMessages(input: {
  message: string;
  image?: string;
  turns: ChatTurn[];
}): WireMessage[] {
  const messages: WireMessage[] = [{ role: "system", content: CHAT_SYSTEM }];

  for (const turn of input.turns) {
    // 失败气泡是 UI 状态；空文本来自「正在流式写入」的占位气泡 —— 两者都不该进上下文
    if (turn.kind === "error" || turn.text.trim().length === 0) continue;
    if (turn.kind === "guess") {
      messages.push({ role: "user", content: PREVIOUS_DRAWING_PROMPT });
      messages.push({ role: "assistant", content: turn.text });
    } else {
      messages.push({ role: turn.role, content: turn.text });
    }
  }

  if (input.image) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: input.message },
        { type: "image_url", image_url: { url: input.image, detail: "high" } },
      ],
    });
  } else {
    messages.push({ role: "user", content: input.message });
  }

  return messages;
}

/**
 * 发起流式对话，成功时返回 DeepSeek 的原始响应体。
 *
 * 这里只负责「拿到流」；把 DeepSeek 的 SSE 转成我们自己的事件协议是 route 的事。
 * 状态码非 2xx 会在建流之前就抛出 ApiError，这样 route 还能返回一个正常的 JSON 错误
 * （而不是先建立一个 200 的流、再往里塞错误 —— 那样客户端解析起来更麻烦）。
 */
export async function openChatStream(input: {
  message: string;
  image?: string;
  turns: ChatTurn[];
  think: boolean;
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = readApiKey();

  const timeout = AbortSignal.timeout(CHAT_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;

  const body = {
    model: MODEL,
    messages: buildChatMessages(input),
    // 深度思考由用户在面板里开关，默认关（PRD §10 第 2 条）
    thinking: { type: input.think ? "enabled" : "disabled" },
    max_tokens: 800,
    stream: true,
  };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ApiError("UPSTREAM_TIMEOUT", "AI 想了太久，再试一次？");
    }
    throw new ApiError("UPSTREAM_ERROR", "网络好像断了，检查一下连接");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw upstreamError(res.status, detail.slice(0, 400));
  }
  if (!res.body) {
    throw new ApiError("BAD_UPSTREAM_RESPONSE", "AI 没有返回内容，再试一次？");
  }
  return res.body;
}

/**
 * 从 DeepSeek 的一个流式分片里取出增量。
 * 思维链走 reasoning_content，与正文同级；关闭思考模式时不会出现。
 */
export function parseStreamChunk(
  payload: unknown,
): { delta?: string; reasoning?: string } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (typeof delta !== "object" || delta === null) return null;

  const content = (delta as { content?: unknown }).content;
  const reasoning = (delta as { reasoning_content?: unknown }).reasoning_content;

  const out: { delta?: string; reasoning?: string } = {};
  if (typeof content === "string" && content.length > 0) out.delta = content;
  if (typeof reasoning === "string" && reasoning.length > 0) out.reasoning = reasoning;
  return out.delta || out.reasoning ? out : null;
}
