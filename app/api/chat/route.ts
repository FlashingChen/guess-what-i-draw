import { ChatRequest } from "@/lib/apiSchema";
import { ApiError, openChatStream, parseStreamChunk } from "@/lib/deepseek";
import { readSSE } from "@/lib/sse";
import type { ChatTurn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 我们发给浏览器的 SSE 事件协议（比 DeepSeek 的原始格式简单得多）：
 *   {"delta":"这"}      正文增量
 *   {"reasoning":"..."} 思维链增量（开启深度思考时才有）
 *   {"done":true}       正常结束
 *   {"error":{...}}     流中途出错
 */
function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function jsonError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("BAD_REQUEST", "请求体不是合法 JSON", 400);
  }

  const parsed = ChatRequest.safeParse(raw);
  if (!parsed.success) {
    console.warn("[api/chat] 参数校验失败:", parsed.error.issues[0]?.message);
    return jsonError("BAD_REQUEST", "请求参数不合法", 400);
  }

  // 先把上游建起来再决定返回什么：这样鉴权/余额这类错误还能走正常的 JSON 响应，
  // 而不是先开一个 200 的流再往里塞错误，客户端就得同时处理两种失败形态。
  let upstream: ReadableStream<Uint8Array>;
  try {
    upstream = await openChatStream({
      message: parsed.data.message,
      image: parsed.data.image,
      turns: parsed.data.turns as ChatTurn[],
      think: parsed.data.think,
      // 浏览器断开或点「停止」时，连带掐掉上游请求，别让 token 继续烧
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`[api/chat] ${error.code}: ${error.detail ?? error.message}`);
      const status =
        error.code === "MISSING_KEY" ? 500 : error.code === "UPSTREAM_TIMEOUT" ? 504 : 502;
      return jsonError(error.code, error.message, status);
    }
    console.error("[api/chat] 未预期错误:", error);
    return jsonError("UPSTREAM_ERROR", "AI 开小差了，再试一次？", 500);
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(payload)));
        } catch {
          closed = true;
        }
      };

      try {
        for await (const data of readSSE(upstream)) {
          if (data === "[DONE]") break;
          let chunk: unknown;
          try {
            chunk = JSON.parse(data);
          } catch {
            // 单个坏分片直接跳过，不要因为一行脏数据中断整段回答
            continue;
          }
          const parsedChunk = parseStreamChunk(chunk);
          if (parsedChunk) send(parsedChunk);
        }
        send({ done: true });
      } catch (error) {
        console.error("[api/chat] 流中断:", error);
        send({ error: { code: "UPSTREAM_ERROR", message: "回答中断了，再试一次？" } });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* 已经关了 */
        }
      }
    },
    cancel() {
      closed = true;
      void upstream.cancel().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 防止反向代理缓冲整个响应，把流式变成「最后一次性蹦出来」
      "X-Accel-Buffering": "no",
    },
  });
}
