import { exportBoardImage } from "./canvas";
import { readSSE } from "./sse";
import { useBoardStore } from "@/store/useBoardStore";
import { useChatStore } from "@/store/useChatStore";
import type { ChatTurn } from "@/types";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function errorTurn(text: string, retry: "guess" | "chat"): ChatTurn {
  return { id: newId(), role: "assistant", kind: "error", text, createdAt: Date.now(), retry };
}

function failTurn(id: string, message: string): void {
  useChatStore.getState().updateTurn(id, { kind: "error", text: message });
}

/** 当前画布快照；空画板返回 undefined（聊天时可以不附图）。 */
function snapshotImage(): string | undefined {
  const strokes = useBoardStore.getState().strokes;
  return strokes.length > 0 ? exportBoardImage(strokes) : undefined;
}

// ---------------------------------------------------------------------------
// 猜词
// ---------------------------------------------------------------------------

/**
 * 发起一次猜测。
 *
 * 这是猜词唯一的入口 —— 悬浮球点击、面板按钮、错误块重试都走这里，
 * 所以防重复请求、空画板拦截这类规则只需要写一遍。
 */
export async function runGuess(): Promise<void> {
  const chat = useChatStore.getState();

  // AC-18：猜词进行中重复触发直接忽略，不产生第二个请求。
  // 按钮的 disabled 只是视觉提示，真正的闸门在这里。
  if (chat.status !== "idle") return;

  const strokes = useBoardStore.getState().strokes;
  if (strokes.length === 0) {
    // AC-6：空画板只提示，不发请求
    chat.showToast("先画点什么吧");
    return;
  }

  chat.openPanel();
  chat.setStatus("guessing");

  // 在状态切到 guessing 之后再取快照与历史，保证发给模型的就是当前画面
  const image = exportBoardImage(strokes);
  const turns = chat.turns.map(({ role, kind, text }) => ({ role, kind, text }));

  try {
    const response = await fetch("/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, turns }),
    });

    const data = (await response.json().catch(() => null)) as
      | { guess?: unknown; error?: { message?: unknown } }
      | null;

    const store = useChatStore.getState();

    if (!response.ok || typeof data?.guess !== "string" || data.guess.length === 0) {
      const message =
        typeof data?.error?.message === "string"
          ? data.error.message
          : "AI 开小差了，再试一次？";
      store.addTurn(errorTurn(message, "guess"));
      return;
    }

    store.addTurn({
      id: newId(),
      role: "assistant",
      kind: "guess",
      text: data.guess,
      createdAt: Date.now(),
    });
  } catch {
    useChatStore.getState().addTurn(errorTurn("网络好像断了，检查一下连接", "guess"));
  } finally {
    useChatStore.getState().setStatus("idle");
  }
}

// ---------------------------------------------------------------------------
// 聊天
// ---------------------------------------------------------------------------

let chatAbort: AbortController | null = null;

/** 用户点「停止」：掐掉当前这一轮对话。 */
export function cancelChat(): void {
  chatAbort?.abort();
}

/**
 * 发一条聊天消息，流式接收回答。
 *
 * 编排顺序很关键：历史必须在插入本轮消息之前取，否则刚打的这句话会被
 * 当作历史再发一遍；而用户气泡和占位助手气泡要立刻进列表，流式才有落点。
 */
export async function sendChat(message: string): Promise<void> {
  const text = message.trim();
  if (text.length === 0) return;

  const store = useChatStore.getState();
  if (store.status !== "idle") return;

  const image = snapshotImage();
  const turns = store.turns.map(({ role, kind, text: t }) => ({ role, kind, text: t }));
  const think = store.deepThink;

  const assistantId = newId();
  store.addTurn({ id: newId(), role: "user", kind: "text", text, createdAt: Date.now() });
  store.addTurn({
    id: assistantId,
    role: "assistant",
    kind: "text",
    text: "",
    createdAt: Date.now(),
  });
  store.setStatus("chatting");
  store.setStreamingId(assistantId);
  store.setReasoning(false);

  const controller = new AbortController();
  chatAbort = controller;
  let received = "";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, image, turns, think }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: unknown } }
        | null;
      failTurn(
        assistantId,
        typeof data?.error?.message === "string"
          ? data.error.message
          : "AI 开小差了，再试一次？",
      );
      return;
    }

    for await (const payload of readSSE(response.body)) {
      let event: {
        delta?: unknown;
        reasoning?: unknown;
        done?: unknown;
        error?: { message?: unknown };
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      if (event.error) {
        failTurn(
          assistantId,
          typeof event.error.message === "string"
            ? event.error.message
            : "回答中断了，再试一次？",
        );
        return;
      }
      if (typeof event.delta === "string" && event.delta.length > 0) {
        received += event.delta;
        useChatStore.getState().appendDelta(assistantId, event.delta);
      } else if (typeof event.reasoning === "string") {
        useChatStore.getState().setReasoning(true);
      }
      if (event.done) break;
    }

    if (received.length === 0) failTurn(assistantId, "AI 没有回答，再试一次？");
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    if (aborted) {
      // 用户主动停止：已经吐出来的内容保留，一个字都没有才标成失败
      if (received.length === 0) {
        useChatStore.getState().updateTurn(assistantId, {
          kind: "error",
          text: "已停止生成",
          retry: "chat",
        });
      }
    } else {
      failTurn(assistantId, "网络好像断了，检查一下连接");
    }
  } finally {
    chatAbort = null;
    const finalStore = useChatStore.getState();
    finalStore.setStreamingId(null);
    finalStore.setReasoning(false);
    finalStore.setStatus("idle");
  }
}

/**
 * 重试一条聊天失败气泡。
 *
 * 把那条错误气泡和它对应的用户发言一起撤掉再重发，这样界面不会留下
 * 重复的提问，也不会出现一串错误块。
 */
export async function retryChat(errorTurnId: string): Promise<void> {
  const store = useChatStore.getState();
  if (store.status !== "idle") return;

  const turns = store.turns;
  const errorIndex = turns.findIndex((turn) => turn.id === errorTurnId);
  if (errorIndex < 0) return;

  let userIndex = -1;
  for (let i = errorIndex - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.role === "user" && turn.kind === "text" && turn.text.trim().length > 0) {
      userIndex = i;
      break;
    }
  }
  if (userIndex < 0) return;

  const retryText = turns[userIndex].text;
  store.removeTurns([turns[errorIndex].id, turns[userIndex].id]);
  await sendChat(retryText);
}

/** 「重新开始一局」：画布和对话一起清掉。 */
export function resetGame(): void {
  useBoardStore.getState().clear();
  useChatStore.getState().reset();
}
