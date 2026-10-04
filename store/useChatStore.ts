import { create } from "zustand";
import type { ChatTurn } from "@/types";

export type GameStatus = "idle" | "guessing" | "chatting";

interface ChatState {
  turns: ChatTurn[];
  status: GameStatus;
  panelOpen: boolean;
  toast: string | null;
  /** 正在被流式写入的那条 turn 的 id，UI 靠它决定在哪条气泡上画光标。 */
  streamingId: string | null;
  /** 模型正处在思维链阶段（还没吐正文），仅在开启深度思考时会出现。 */
  reasoning: boolean;
  /** 「深度思考」开关，默认关（PRD §10 第 2 条）。 */
  deepThink: boolean;

  openPanel: () => void;
  closePanel: () => void;
  addTurn: (turn: ChatTurn) => void;
  updateTurn: (id: string, patch: Partial<ChatTurn>) => void;
  removeTurns: (ids: string[]) => void;
  appendDelta: (id: string, delta: string) => void;
  setStatus: (status: GameStatus) => void;
  setStreamingId: (id: string | null) => void;
  setReasoning: (value: boolean) => void;
  setDeepThink: (value: boolean) => void;
  showToast: (message: string) => void;
  /** 只清空对话，不动画布。 */
  reset: () => void;
}

const TOAST_MS = 2200;

// 放在 store 外面：这是 UI 层的临时定时器，不属于可序列化状态。
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useChatStore = create<ChatState>((set) => ({
  turns: [],
  status: "idle",
  panelOpen: false,
  toast: null,
  streamingId: null,
  reasoning: false,
  deepThink: false,

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),

  addTurn: (turn) => set((state) => ({ turns: [...state.turns, turn] })),

  updateTurn: (id, patch) =>
    set((state) => ({
      turns: state.turns.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)),
    })),

  removeTurns: (ids) =>
    set((state) => ({ turns: state.turns.filter((turn) => !ids.includes(turn.id)) })),

  appendDelta: (id, delta) =>
    set((state) => ({
      // 正文一开始，思维链提示就该让位
      reasoning: false,
      turns: state.turns.map((turn) =>
        turn.id === id ? { ...turn, text: turn.text + delta } : turn,
      ),
    })),

  setStatus: (status) => set({ status }),
  setStreamingId: (streamingId) => set({ streamingId }),
  setReasoning: (reasoning) => set({ reasoning }),
  setDeepThink: (deepThink) => set({ deepThink }),

  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => {
      toastTimer = null;
      set({ toast: null });
    }, TOAST_MS);
  },

  reset: () => set({ turns: [], status: "idle", streamingId: null, reasoning: false }),
}));
