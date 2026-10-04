import { GuessRequest } from "@/lib/apiSchema";
import { ApiError, guessDrawing } from "@/lib/deepseek";
import type { ChatTurn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail("BAD_REQUEST", "请求体不是合法 JSON", 400);
  }

  const parsed = GuessRequest.safeParse(payload);
  if (!parsed.success) {
    // 不把 Zod 原始报错抛给用户，只在服务端留一条便于排查
    console.warn("[api/guess] 参数校验失败:", parsed.error.issues[0]?.message);
    return fail("BAD_REQUEST", "请求参数不合法", 400);
  }

  try {
    const guess = await guessDrawing({
      image: parsed.data.image,
      turns: parsed.data.turns as ChatTurn[],
    });
    return Response.json({ guess });
  } catch (error) {
    if (error instanceof ApiError) {
      // 服务端日志留全量细节，返回给浏览器的只有人话文案
      console.error(`[api/guess] ${error.code}: ${error.detail ?? error.message}`);
      const status =
        error.code === "MISSING_KEY"
          ? 500
          : error.code === "UPSTREAM_TIMEOUT"
            ? 504
            : 502;
      return fail(error.code, error.message, status);
    }
    console.error("[api/guess] 未预期错误:", error);
    return fail("UPSTREAM_ERROR", "AI 开小差了，再试一次？", 500);
  }
}
