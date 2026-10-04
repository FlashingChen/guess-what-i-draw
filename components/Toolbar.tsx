"use client";

import { useEffect, useState } from "react";
import { PEN_COLORS, PEN_SIZES } from "@/lib/board";
import { exportBoardImage } from "@/lib/canvas";
import { useBoardStore } from "@/store/useBoardStore";

const BTN =
  "flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
const BTN_ACTIVE = "bg-slate-900 text-white hover:bg-slate-900";

function IconEraser() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 19.5 4.2 15.2a1.6 1.6 0 0 1 0-2.3l7.8-7.8a1.6 1.6 0 0 1 2.3 0l4.3 4.3a1.6 1.6 0 0 1 0 2.3l-8 8z" />
      <path d="M20 19.5h-8" />
      <path d="m9 8.6 6.4 6.4" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9.5 7V4.8h5V7" />
      <path d="m6.5 7 .9 12.2h9.2L17.5 7" />
      <path d="M10.5 11v5M13.5 11v5" />
    </svg>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" />;
}

export default function Toolbar() {
  const tool = useBoardStore((s) => s.tool);
  const color = useBoardStore((s) => s.color);
  const size = useBoardStore((s) => s.size);
  const hasStrokes = useBoardStore((s) => s.strokes.length > 0);

  const [confirmClear, setConfirmClear] = useState(false);
  const isDev = process.env.NODE_ENV === "development";

  // 二次确认 3 秒内没点就自动撤销，避免按钮一直停在「确认清空？」状态。
  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  const handleExportSnapshot = () => {
    const url = exportBoardImage(useBoardStore.getState().strokes);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-5 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-2xl border border-slate-200/80 bg-white/85 px-3 py-2 shadow-lg shadow-slate-900/5 backdrop-blur">
        {PEN_COLORS.map((c) => {
          const active = tool === "pen" && color === c.value;
          return (
            <button
              key={c.value}
              type="button"
              title={c.name}
              aria-label={`画笔颜色 ${c.name}`}
              aria-pressed={active}
              onClick={() => useBoardStore.getState().setColor(c.value)}
              style={{ backgroundColor: c.value }}
              className={`h-6 w-6 shrink-0 rounded-full transition-transform ${
                active
                  ? "ring-2 ring-slate-900 ring-offset-2"
                  : "ring-1 ring-slate-900/10 hover:scale-110"
              }`}
            />
          );
        })}

        <Divider />

        {PEN_SIZES.map((s) => {
          const active = size === s.value;
          const dot = 5 + (s.value / 30) * 13;
          return (
            <button
              key={s.value}
              type="button"
              title={`${s.name}（${s.value}）`}
              aria-label={`笔宽 ${s.name}`}
              aria-pressed={active}
              onClick={() => useBoardStore.getState().setSize(s.value)}
              className={`${BTN} w-9 px-0 ${active ? BTN_ACTIVE : ""}`}
            >
              <span
                className="rounded-full bg-current"
                style={{ width: dot, height: dot }}
              />
            </button>
          );
        })}

        <Divider />

        <button
          type="button"
          title="橡皮"
          aria-label="橡皮"
          aria-pressed={tool === "eraser"}
          onClick={() =>
            useBoardStore
              .getState()
              .setTool(tool === "eraser" ? "pen" : "eraser")
          }
          className={`${BTN} ${tool === "eraser" ? BTN_ACTIVE : ""}`}
        >
          <IconEraser />
        </button>

        <button
          type="button"
          title="撤销"
          aria-label="撤销"
          disabled={!hasStrokes}
          onClick={() => useBoardStore.getState().undo()}
          className={BTN}
        >
          <IconUndo />
        </button>

        <button
          type="button"
          disabled={!hasStrokes}
          aria-label={confirmClear ? "确认清空" : "清空画布"}
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            useBoardStore.getState().clear();
            setConfirmClear(false);
          }}
          className={`${BTN} ${
            confirmClear
              ? "bg-red-500 text-white hover:bg-red-500"
              : ""
          }`}
        >
          <IconTrash />
          {confirmClear ? "确认清空？" : null}
        </button>

        {isDev ? (
          <>
            <Divider />
            <button
              type="button"
              disabled={!hasStrokes}
              onClick={handleExportSnapshot}
              title="仅开发环境可见：把当前画布导出成 PNG，用于核对白底与线条清晰度"
              className={BTN}
            >
              导出快照
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
