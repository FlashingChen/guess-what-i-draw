/**
 * 把模型输出规范化成「干净的一个词」。
 *
 * 即使 system prompt 已经严令只输出一个词，也不能假定模型一定照做：
 * 它可能加上「我猜是」、加书名号、换行补一句解释、或者写出「这是一只猫」。
 * 这里逐层剥掉这些包装，最后兜一个长度上限。
 */

/** 常见前缀，按长度从长到短排列，避免短前缀先把长前缀切断。 */
const PREFIXES = [
  "这幅画画的是",
  "这幅画的是",
  "这画画的是",
  "我觉得是",
  "看起来像",
  "看起来是",
  "应该是",
  "可能是",
  "大概是",
  "答案是",
  "我猜是",
  "画的是",
  "这是",
  "我猜",
  "答案",
  "像",
];

/** 「一只猫」→「猫」这种量词也要剥掉。 */
const QUANTIFIER = /^(?:一|两|三|几)?(?:只|个|条|头|辆|架|朵|棵|把|张|片|座|台|部|支|根|块|件|双|对|群|束|串|枚|颗|面|扇)/;

const LEADING_NOISE = /^[#*\-–—>·:：,，.。、\s]+/;
const WRAPPING_NOISE = /[「」『』“”‘’"'`《》〈〉【】[\]]/g;
const TRAILING_PUNCT = /[。．.!！?？~～,，、:：;；\s]+$/;
const MAX_LEN = 8;

export function normalizeGuess(raw: unknown): string {
  if (typeof raw !== "string") return "";

  // 1. 取第一行有内容的
  const firstLine =
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";

  let s = firstLine.replace(LEADING_NOISE, "");

  // 2. 反复剥前缀：处理「我猜是：一只猫」这种叠加
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const prefix of PREFIXES) {
      if (s.length > prefix.length && s.startsWith(prefix)) {
        s = s.slice(prefix.length);
        stripped = true;
      }
    }
    const afterSeparator = s.replace(/^[:：,，.。、\s]+/, "");
    if (afterSeparator !== s) {
      s = afterSeparator;
      stripped = true;
    }
  }

  // 3. 去引号、书名号等包装
  s = s.replace(WRAPPING_NOISE, "");

  // 4. 剥量词（只在剥完还剩东西时才动手）
  const withoutQuantifier = s.replace(QUANTIFIER, "");
  if (withoutQuantifier.length > 0) s = withoutQuantifier;

  s = s.replace(TRAILING_PUNCT, "");

  // 5. 兜底：剥得只剩空就退回原始首行，别返回空字符串
  if (s.length === 0) {
    return firstLine.replace(WRAPPING_NOISE, "").slice(0, MAX_LEN);
  }
  return s.length > MAX_LEN ? s.slice(0, MAX_LEN) : s;
}
