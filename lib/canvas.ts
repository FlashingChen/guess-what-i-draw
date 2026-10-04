import { BOARD_BG, BOARD_SIZE, ERASER_COLOR, EXPORT_SIZE } from "./board";
import type { Point, Stroke } from "@/types";

type InkStyle = Pick<Stroke, "tool" | "color" | "size">;

export function inkColor(ink: InkStyle): string {
  return ink.tool === "eraser" ? ERASER_COLOR : ink.color;
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function applyStyle(ctx: CanvasRenderingContext2D, ink: InkStyle): void {
  const c = inkColor(ink);
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = ink.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/** 单击不拖动时留下的一个点。 */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  ink: InkStyle,
  p: Point,
): void {
  applyStyle(ctx, ink);
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(ink.size / 2, 0.5), 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 整条笔画的「规范路径」。
 *
 * 它与下面「逐段增量绘制 + 收尾」的结果严格等价，这一点是刻意的：
 * 绘制过程中走增量路径（每次 pointermove 只画一小段，笔画再多也不掉帧），
 * 抬笔后 store 更新触发全量重绘时走这条规范路径，
 * 两者像素级一致 —— 所以全量重绘不会出现任何视觉跳动。
 */
export function traceStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
): void {
  ctx.beginPath();
  if (points.length < 2) return;

  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  // 用相邻点的中点作为二次贝塞尔的落点，避免快速拖动时的折线感。
  const first = mid(points[0], points[1]);
  ctx.lineTo(first.x, first.y);
  for (let i = 2; i < points.length; i++) {
    const m = mid(points[i - 1], points[i]);
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, m.x, m.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  const points = stroke.points;
  if (points.length === 0) return;
  if (points.length === 1) {
    drawDot(ctx, stroke, points[0]);
    return;
  }
  applyStyle(ctx, stroke);
  traceStroke(ctx, points);
  ctx.stroke();
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
): void {
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

/**
 * 增量绘制：第 n 个点加入时只补这一小段。
 * 颜色不透明，所以相邻段重叠处不会出现半透明接缝。
 */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  ink: InkStyle,
  points: Point[],
  n: number,
): void {
  if (n < 1 || n >= points.length) return;
  const prev = points[n - 1];
  const curr = points[n];
  const m = mid(prev, curr);

  applyStyle(ctx, ink);
  ctx.beginPath();
  if (n === 1) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(m.x, m.y);
  } else {
    const from = mid(points[n - 2], prev);
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(prev.x, prev.y, m.x, m.y);
  }
  ctx.stroke();
}

/** 抬笔收尾：把最后一个中点连到真实的抬笔点，保证笔画末端不被截掉半段。 */
export function drawTail(
  ctx: CanvasRenderingContext2D,
  ink: InkStyle,
  points: Point[],
): void {
  const n = points.length - 1;
  if (n < 1) return;
  const curr = points[n];
  const m = mid(points[n - 1], curr);

  applyStyle(ctx, ink);
  ctx.beginPath();
  ctx.moveTo(m.x, m.y);
  ctx.lineTo(curr.x, curr.y);
  ctx.stroke();
}

/**
 * 导出喂给模型的快照（data URL）。
 *
 * 先铺满白底再画笔画 —— 这一步不能省：canvas.toDataURL 默认输出透明背景，
 * 模型面对透明区域可能理解为黑色或「空洞」，会明显拉低识别率。
 */
export function exportBoardImage(
  strokes: Stroke[],
  size: number = EXPORT_SIZE,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法获取 2d context");

  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, size, size);

  const scale = size / BOARD_SIZE;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawStrokes(ctx, strokes);

  return canvas.toDataURL("image/png");
}
