export type Tool = "pen" | "eraser";

export interface Point {
  x: number;
  y: number;
}

/** 一笔。坐标全部使用「画板坐标系」（0..BOARD_SIZE），与窗口尺寸无关。 */
export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  kind: "guess" | "text" | "hint" | "error";
  text: string;
  createdAt: number;
  /**
   * 仅对 error 气泡有意义：点「重试」时应该重发哪一类的请求。
   * 没有它的话，聊天失败的「重试」会跑去猜词 —— 两个端点是不同的。
   */
  retry?: "guess" | "chat";
}
