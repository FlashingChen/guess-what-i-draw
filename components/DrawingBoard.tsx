"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BOARD_SIZE, toBoardPoint } from "@/lib/board";
import {
  drawDot,
  drawSegment,
  drawStrokes,
  drawTail,
  exportBoardImage,
} from "@/lib/canvas";
import { useBoardStore } from "@/store/useBoardStore";
import type { Point, Stroke, Tool } from "@/types";

/** 采样阈值（画板坐标）。太小会被高频 pointermove 灌爆，太大会丢细节。 */
const MIN_POINT_DISTANCE = 1.2;

interface Draft {
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
}

export default function DrawingBoard({ children }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Draft | null>(null);
  const boardPxRef = useRef(0);
  const [boardPx, setBoardPx] = useState(0);

  const strokes = useBoardStore((s) => s.strokes);

  /**
   * 全量重绘。
   *
   * 刻意不把 strokes 放进依赖，改成从 store 里即时读取 —— 这样函数引用恒定，
   * 尺寸变化时就不会连带触发一次多余的重绘。
   */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const side = boardPxRef.current;
    if (!canvas || side <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    // 重设 width/height 会顺带清空画布与 ctx 状态，比手动 clearRect 更省心。
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);

    const scale = (side / BOARD_SIZE) * dpr;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawStrokes(ctx, useBoardStore.getState().strokes);
  }, []);

  // 画板是正方形，边长取容器内容区较窄的一边。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      const side = Math.max(120, Math.floor(Math.min(rect.width, rect.height)));
      boardPxRef.current = side;
      setBoardPx((prev) => (prev === side ? prev : side));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (boardPx > 0) redraw();
  }, [boardPx, redraw]);

  // 抬笔提交、撤销、清空都会让 strokes 变化，这里统一兜一次全量重绘。
  useEffect(() => {
    redraw();
  }, [strokes, redraw]);

  // 开发期验证钩子：在 DevTools 里执行 __exportBoard() 可以直接拿到 dataURL。
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __exportBoard?: () => string };
    w.__exportBoard = () => exportBoardImage(useBoardStore.getState().strokes);
    return () => {
      delete w.__exportBoard;
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas || boardPxRef.current <= 0) return;
    e.preventDefault();

    const { tool, color, size } = useBoardStore.getState();
    draftRef.current = {
      tool,
      color,
      size,
      points: [toBoardPoint(e.clientX, e.clientY, canvas.getBoundingClientRect())],
    };
    // 指针捕获失败不应中断绘制：合成事件或个别浏览器下 pointerId 可能无效，
    // 此时退化为靠冒泡继续接收事件，笔画依然画得出来。
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 忽略：无捕获也能绘制 */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const draft = draftRef.current;
    const canvas = canvasRef.current;
    if (!draft || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const p = toBoardPoint(
      e.clientX,
      e.clientY,
      canvas.getBoundingClientRect(),
    );
    const last = draft.points[draft.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_POINT_DISTANCE) return;

    draft.points.push(p);
    drawSegment(ctx, draft, draft.points, draft.points.length - 1);
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const draft = draftRef.current;
    const canvas = canvasRef.current;
    if (!draft || !canvas) return;
    const ctx = canvas.getContext("2d");
    draftRef.current = null;

    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* 忽略：本来就没捕获成功 */
    }
    if (!ctx) return;

    // 绘制时走的是增量路径，这里把最后一小段补齐；
    // 随后 store 更新触发的全量重绘与它像素级一致，所以不会出现跳动。
    if (draft.points.length === 1) drawDot(ctx, draft, draft.points[0]);
    else drawTail(ctx, draft, draft.points);

    const stroke: Stroke = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tool: draft.tool,
      color: draft.color,
      size: draft.size,
      points: draft.points,
    };
    useBoardStore.getState().addStroke(stroke);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center px-6 pb-10 pt-24"
    >
      {/*
        画板是一个尺寸确定的方块，children 挂进这个方块内部。
        AI 面板就是用这个容器做定位基准的 —— 这样它天然「压在画板上」，
        不需要任何 getBoundingClientRect 换算，也不会跑到画板外面的空白区。
      */}
      <div
        className="relative"
        style={{ width: boardPx || 0, height: boardPx || 0 }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-crosshair touch-none select-none rounded-2xl bg-white shadow-[0_18px_50px_-18px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onContextMenu={(e) => e.preventDefault()}
        />
        {children}
      </div>
    </div>
  );
}
