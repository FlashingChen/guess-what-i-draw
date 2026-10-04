import type { ChatTurn } from "@/types";

/** AI 的猜测结果。渲染成一张大字卡片，是整局里视觉权重最高的元素。 */
export default function GuessCard({ turn, index }: { turn: ChatTurn; index: number }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-sm">
        <p className="text-[11px] font-medium tracking-wider text-slate-400">
          第 {index} 次猜测
        </p>
        <p className="mt-0.5 text-3xl font-bold leading-tight break-all">{turn.text}</p>
      </div>
    </div>
  );
}
