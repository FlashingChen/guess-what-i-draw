import type { ChatTurn } from "@/types";

interface Props {
  turn: ChatTurn;
  /** 这条气泡正在被流式写入，尾巴上画一个光标。 */
  streaming?: boolean;
  /** 模型还在思维链阶段，正文一个字都没出来。 */
  reasoning?: boolean;
  onRetry: () => void;
}

/** 聊天气泡，以及错误块。错误块必须自带重试入口，不然用户只能刷新页面。 */
export default function MessageBubble({
  turn,
  streaming = false,
  reasoning = false,
  onRetry,
}: Props) {
  if (turn.kind === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          <p>{turn.text}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-lg bg-red-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const mine = turn.role === "user";
  const waiting = streaming && turn.text.length === 0;

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap ${
          mine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
        }`}
      >
        {waiting ? (
          reasoning ? (
            <span className="text-slate-400">正在深入思考…</span>
          ) : (
            <span className="inline-flex items-center gap-1 align-middle">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
            </span>
          )
        ) : (
          <>
            {turn.text}
            {streaming ? (
              <span className="ml-0.5 inline-block h-3.5 w-[3px] animate-pulse rounded-full bg-slate-400 align-middle" />
            ) : null}
          </>
        )}
      </p>
    </div>
  );
}
