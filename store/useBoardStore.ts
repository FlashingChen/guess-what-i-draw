import { create } from "zustand";
import { PEN_COLORS, PEN_SIZES } from "@/lib/board";
import type { Stroke, Tool } from "@/types";

interface BoardState {
  strokes: Stroke[];
  tool: Tool;
  color: string;
  size: number;
  setTool: (tool: Tool) => void;
  /** 选颜色时自动切回画笔，避免「选了红色结果还在擦」的困惑。 */
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  addStroke: (stroke: Stroke) => void;
  undo: () => void;
  clear: () => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  strokes: [],
  tool: "pen",
  color: PEN_COLORS[0].value,
  size: PEN_SIZES[1].value,

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color, tool: "pen" }),
  setSize: (size) => set({ size }),

  addStroke: (stroke) => set((s) => ({ strokes: [...s.strokes, stroke] })),
  undo: () => set((s) => ({ strokes: s.strokes.slice(0, -1) })),
  clear: () => set({ strokes: [] }),
}));
