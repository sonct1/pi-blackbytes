export interface ToolResultEvent {
  toolName: string;
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

const CID_CHARS = "ZPMQVRWSNKTXJBYH";

function computeCID(lineNum: number, content: string): string {
  let hash = lineNum * 31;
  for (let i = 0; i < Math.min(content.length, 32); i++) {
    hash = (hash * 31 + content.charCodeAt(i)) & 0xffff;
  }
  return CID_CHARS[hash & 0xf] + CID_CHARS[(hash >> 4) & 0xf];
}

function rewriteWithHashlineAnchors(text: string): string {
  const lines = text.split("\n");
  return lines
    .map((line, idx) => {
      const lineNum = idx + 1;
      const cid = computeCID(lineNum, line);
      return `${lineNum}#${cid}|${line}`;
    })
    .join("\n");
}

export function processToolResult(
  event: ToolResultEvent,
  config: { hashline_edit: boolean },
): ToolResultEvent | null {
  try {
    if (!config.hashline_edit || event.isError) return null;

    if (event.toolName === "read") {
      if (!event.content) return null;
      let changed = false;
      const newContent = event.content.map((block) => {
        if (block.type !== "text" || block.text === undefined) return block;
        changed = true;
        return { ...block, text: rewriteWithHashlineAnchors(block.text) };
      });
      if (!changed) return null;
      return { ...event, content: newContent };
    }

    if (event.toolName === "write") {
      if (!event.content) return null;
      let changed = false;
      const newContent = event.content.map((block) => {
        if (block.type !== "text" || block.text === undefined) return block;
        // Count lines from original content
        const lineCount = block.text.split("\n").length;
        changed = true;
        return { ...block, text: `File written successfully. ${lineCount} lines written.` };
      });
      if (!changed) return null;
      return { ...event, content: newContent };
    }

    return null;
  } catch {
    return null;
  }
}
