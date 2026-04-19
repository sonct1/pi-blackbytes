export const CID_CHARS = "ZPMQVRWSNKTXJBYH";

export function computeCID(lineNum: number, content: string): string {
  let hash = lineNum * 31;
  for (let i = 0; i < Math.min(content.length, 32); i++) {
    hash = (hash * 31 + content.charCodeAt(i)) & 0xffff;
  }
  return CID_CHARS[hash & 0xf] + CID_CHARS[(hash >> 4) & 0xf];
}
