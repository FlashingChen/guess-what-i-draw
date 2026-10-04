"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { runGuess } from "@/lib/game";
import {
  ORB_SIZE,
  clampOrbPosition,
  getOrbPosition,
  getServerOrbPosition,
  setOrbPosition,
  subscribeOrbPosition,
} from "@/lib/orbPosition";
import { useChatStore } from "@/store/useChatStore";

/** 位移小于这个值才算「点击」而不是「拖拽」，避免手抖导致误触发。 */
const CLICK_SLOP = 5;

interface DragState {
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  moved: number;
}

export default function AiOrb() {
  const panelOpen = useChatStore((state) => state.panelOpen);
  const status = useChatStore((state) => state.status);
  const hasGuess = useChatStore((state) => state.turns.some((turn) => turn.kind === "guess"));

  const pos = useSyncExternalStore(
    subscribeOrbPosition,
    getOrbPosition,
    getServerOrbPosition,
  );
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  // 窗口变小后原坐标可能已经在视口外，重新夹紧（回调里更新，不是 effect 体内）
  useEffect(() => {
    const onResize = () => {
      const current = getOrbPosition();
      setOrbPosition(clampOrbPosition(current.x, current.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: pos.x,
      baseY: pos.y,
      moved: 0,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 忽略：无捕获也能拖 */
    }
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    // 记录的是「距右/下边缘」，所以指针往右走，right 要减小
    setOrbPosition(clampOrbPosition(drag.baseX - dx, drag.baseY - dy));
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* 忽略 */
    }

    if (drag.moved < CLICK_SLOP) {
      void runGuess();
      return;
    }

    // 用真实终态算一次，避免依赖可能滞后一帧的 state
    setOrbPosition(
      clampOrbPosition(
        drag.baseX - (event.clientX - drag.startX),
        drag.baseY - (event.clientY - drag.startY),
      ),
      true,
    );
  };

  // F-2.6：面板展开时收起悬浮球，避免与面板重叠
  if (panelOpen) return null;

  const busy = status === "guessing";

  return (
    <button
      type="button"
      aria-label={busy ? "AI 正在猜" : "让 AI 猜我画的是什么"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void runGuess();
        }
      }}
      style={{ right: pos.x, bottom: pos.y, width: ORB_SIZE, height: ORB_SIZE }}
      className={`fixed z-30 flex touch-none items-center justify-center rounded-full bg-slate-900 text-white shadow-xl shadow-slate-900/25 select-none ${
        dragging
          ? "cursor-grabbing"
          : "cursor-grab transition-transform hover:scale-105 active:scale-95"
      }`}
    >
      {busy ? (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-slate-900/25" />
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.2 12S5.8 5.6 12 5.6 21.8 12 21.8 12 18.2 18.4 12 18.4 2.2 12 2.2 12Z" />
          <circle cx="12" cy="12" r="2.8" />
        </svg>
      )}

      {hasGuess && !busy ? (
        <span className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
      ) : null}
    </button>
  );
}
