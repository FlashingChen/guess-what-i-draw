"use client";

import { useEffect, useRef, useState } from "react";
import GuessCard from "./GuessCard";
import MessageBubble from "./MessageBubble";
import { cancelChat, resetGame, retryChat, runGuess, sendChat } from "@/lib/game";
import { useChatStore } from "@/store/useChatStore";
import type { ChatTurn } from "@/types";

/**
 * 给每个猜测轮编号（第 1 次、第 2 次…）。
 * 刻意放在模块作用域而不是渲染函数里累加计数器：在 JSX 的 map 回调里改变
 * 渲染作用域的变量会被 react-hooks/immutability 判定为渲染后改写而报错。
 */
function numberGuesses(turns: ChatTurn[]): Map<string, number> {
  const byId = new Map<string, number>();
  let n = 0;
  for (const turn of turns) {
    if (turn.kind === "guess") {
      n += 1;
      byId.set(turn.id, n);
    }
  }
  return byId;
}

const CHIP = "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const CHIP_GHOST = `${CHIP} border-slate-200 text-slate-600 hover:bg-slate-100 disabled:hover:bg-transparent`;
const CHIP_PRIMARY = `${CHIP} border-transparent bg-slate-900 text-white hover:bg-slate-800 disabled:hover:bg-slate-900`;

const QUICK_ASKS = [
  { label: "你看到了什么？", text: "你看到了什么？" },
  { label: "哪里不清楚？", text: "哪里画得不清楚？" },
];

export default function AiPanel() {
  const panelOpen = useChatStore((state) => state.panelOpen);
  const status = useChatStore((state) => state.status);
  const turns = useChatStore((state) => state.turns);
  const streamingId = useChatStore((state) => state.streamingId);
  const reasoning = useChatStore((state) => state.reasoning);
  const deepThink = useChatStore((state) => state.deepThink);
  const closePanel = useChatStore((state) => state.closePanel);
  const setDeepThink = useChatStore((state) => state.setDeepThink);

  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚到底，但只在用户本来就在底部时才滚 ——
  // 否则他往上翻历史时会被每个新 token 一直拽回底部。
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: streamingId ? "auto" : "smooth" });
    }
  }, [turns, status, streamingId]);

  // 输入框随内容长高，超过上限后内部滚动
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [draft]);

  if (!panelOpen) return null;

  const busy = status !== "idle";
  const chatting = status === "chatting";
  const hasGuess = turns.some((turn) => turn.kind === "guess");
  const guessNumbers = numberGuesses(turns);

  const submit = () => {
    const text = draft.trim();
    if (text.length === 0 || busy) return;
    setDraft("");
    void sendChat(text);
  };

  return (
    <aside
      aria-label="AI 猜词面板"
      // 定位基准是画板方块本身（DrawingBoard 把它挂在画板内部），
      // 所以面板永远压在画板上，不会跑到画板外的灰色留白里。
      // 宽高都按画板尺寸收缩，窄屏下自动变窄变矮，不会撑破画板。
      style={{ width: "min(360px, calc(100% - 2rem))", maxHeight: "calc(100% - 2rem)" }}
      className="absolute right-4 bottom-4 z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">AI 猜词</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={resetGame}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            重新开始一局
          </button>
          <button
            type="button"
            aria-label="收起面板"
            onClick={closePanel}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.length === 0 && status === "idle" ? (
          <p className="py-10 text-center text-sm text-slate-400">
            画点什么，然后让 AI 猜猜看
          </p>
        ) : null}

        {turns.map((turn) =>
          turn.kind === "guess" ? (
            <GuessCard
              key={turn.id}
              turn={turn}
              index={guessNumbers.get(turn.id) ?? 0}
            />
          ) : (
            <MessageBubble
              key={turn.id}
              turn={turn}
              streaming={turn.id === streamingId}
              reasoning={reasoning}
              onRetry={() =>
                turn.retry === "chat" ? void retryChat(turn.id) : void runGuess()
              }
            />
          ),
        )}

        {status === "guessing" ? (
          <div className="flex justify-start">
            <p className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              正在看你的画…
            </p>
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-slate-100 px-3 py-2.5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runGuess()}
            className={CHIP_PRIMARY}
          >
            {status === "guessing" ? "AI 正在猜…" : hasGuess ? "再猜一次" : "让 AI 猜"}
          </button>
          {QUICK_ASKS.map((ask) => (
            <button
              key={ask.label}
              type="button"
              disabled={busy}
              onClick={() => void sendChat(ask.text)}
              className={CHIP_GHOST}
            >
              {ask.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={deepThink}
            title="开启后 AI 会先推理再回答，更准但更慢"
            onClick={() => setDeepThink(!deepThink)}
            className={deepThink ? CHIP_PRIMARY : CHIP_GHOST}
          >
            深度思考{deepThink ? " · 开" : ""}
          </button>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // isComposing 必须判断：中文输入法用回车确认候选词，
              // 少了这一条，选词的同时就把半成品发出去了。
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={busy ? "AI 正在回答…" : "说点什么…"}
            className="max-h-24 min-h-9 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm leading-5 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            type="button"
            onClick={chatting ? cancelChat : submit}
            disabled={chatting ? false : !(!busy && draft.trim().length > 0)}
            className="h-9 shrink-0 rounded-xl bg-slate-900 px-3 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {chatting ? "停止" : "发送"}
          </button>
        </div>
      </footer>
    </aside>
  );
}
