/**
 * 极简 SSE 读取器：把 ReadableStream 拆成一条条 `data:` 的内容。
 *
 * 服务端用它解析 DeepSeek 的流，客户端用它解析我们自己转发出去的流 ——
 * 两边格式都是标准的 `data: ...\n\n`，所以一份实现够用。
 */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      // 统一换行符，省得处理 \r\n\r\n 这种组合
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");

      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        for (const line of block.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            yield trimmed.slice(5).trim();
          }
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  } finally {
    // 消费者提前 break 时（比如用户点了停止）也要把锁还回去
    reader.releaseLock();
  }
}
