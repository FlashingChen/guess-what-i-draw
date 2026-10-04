import type { Point } from "@/types";

/**
 * 画板的逻辑坐标系边长。
 *
 * 关键设计：笔画坐标一律存在这个「画板坐标系」里，而不是屏幕坐标。
 * 好处是推导出来的 ——
 *   1. 窗口变化时笔画位置不变形（不需要按比例缩放坐标）；
 *   2. 导出快照时缩放系数刚好是 EXPORT_SIZE / BOARD_SIZE，本来就是 1:1，
 *      所以 PRD §4.4 ② 里担心的「线宽变细」问题在设计层面就不存在了。
 */
export const BOARD_SIZE = 1024;

/** 导出给模型的快照边长。1024 是识别率与传输体积的性价比最优点。 */
export const EXPORT_SIZE = 1024;

export const BOARD_BG = "#FFFFFF";

/** 橡皮即白色画笔（PRD §4.4 ⑤），省掉 destination-out 带来的撤销与分层边界问题。 */
export const ERASER_COLOR = "#FFFFFF";

export const PEN_COLORS = [
  { name: "黑", value: "#111827" },
  { name: "灰", value: "#6B7280" },
  { name: "红", value: "#EF4444" },
  { name: "橙", value: "#F97316" },
  { name: "黄", value: "#EAB308" },
  { name: "绿", value: "#22C55E" },
  { name: "蓝", value: "#3B82F6" },
  { name: "紫", value: "#8B5CF6" },
] as const;

/**
 * 三档笔宽，单位是画板坐标。
 * 下限取 6 而不是更细：导出到 1024 后，太细的线在模型侧缩放时会糊掉，直接影响识别率。
 */
export const PEN_SIZES = [
  { name: "细", value: 6 },
  { name: "中", value: 14 },
  { name: "粗", value: 30 },
] as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 指针落点 → 画板坐标。直接用 canvas 的实际 rect 换算，不依赖缓存的缩放系数。 */
export function toBoardPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp(((clientX - rect.left) / rect.width) * BOARD_SIZE, 0, BOARD_SIZE),
    y: clamp(((clientY - rect.top) / rect.height) * BOARD_SIZE, 0, BOARD_SIZE),
  };
}
