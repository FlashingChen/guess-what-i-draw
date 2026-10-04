/**
 * 悬浮球位置的小型外部存储。
 *
 * 为什么不用 useState + useEffect 从 localStorage 恢复：那会在 effect 里同步
 * setState，多一次渲染，而且 React 19 的 lint 规则（react-hooks/set-state-in-effect）
 * 会直接报错。localStorage 本来就是一个外部数据源，useSyncExternalStore 才是
 * 对应的正确工具 —— 顺带免费拿到 SSR 快照处理和跨标签页同步。
 */

export interface OrbPosition {
  x: number;
  y: number;
}

export const ORB_SIZE = 56;

const STORAGE_KEY = "guess.orb.position";
/** 默认贴在右下角。 */
const DEFAULT_POSITION: OrbPosition = { x: 24, y: 24 };
/** 距视口边缘的最小留白，防止拖到看不见的地方。 */
const EDGE = 8;

const listeners = new Set<() => void>();
/** getSnapshot 要求引用稳定，所以这里缓存一份。 */
let cached: OrbPosition | null = null;

export function clampOrbPosition(x: number, y: number): OrbPosition {
  const maxX = Math.max(EDGE, window.innerWidth - ORB_SIZE - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - ORB_SIZE - EDGE);
  return {
    x: Math.min(Math.max(EDGE, x), maxX),
    y: Math.min(Math.max(EDGE, y), maxY),
  };
}

function loadFromStorage(): OrbPosition {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const { x, y } = parsed as { x?: unknown; y?: unknown };
        if (typeof x === "number" && typeof y === "number") {
          // 上次存的坐标可能是在更大的窗口下产生的，这里夹回当前视口
          return clampOrbPosition(x, y);
        }
      }
    }
  } catch {
    /* 本地数据坏了就退回默认位置 */
  }
  return DEFAULT_POSITION;
}

export function subscribeOrbPosition(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getOrbPosition(): OrbPosition {
  if (typeof window === "undefined") return DEFAULT_POSITION;
  if (cached === null) cached = loadFromStorage();
  return cached;
}

export function getServerOrbPosition(): OrbPosition {
  return DEFAULT_POSITION;
}

/**
 * persist=false 用于拖拽过程中（每次 pointermove 都写 localStorage 太浪费），
 * 抬指时再传 true 落盘。
 */
export function setOrbPosition(next: OrbPosition, persist = false): void {
  cached = next;
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 写不进去也不影响使用 */
    }
  }
  for (const listener of listeners) listener();
}
