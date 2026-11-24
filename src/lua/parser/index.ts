import luaparse from "luaparse";
import type { Chunk } from "luaparse";

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
  readonly line?: number;
  readonly column?: number;
}

export type ParseResult =
  | { readonly ok: true; readonly ast: Chunk }
  | { readonly ok: false; readonly message: string; readonly span: SourceSpan };

/**
 * Parses with the Lua 5.2 grammar of the target LuaJ (goto/labels, no 5.3
 * bitwise operators). Ranges are UTF-16 offsets into `source`. Imported code
 * is only parsed, never executed.
 */
export function parseLua(source: string): ParseResult {
  try {
    const ast = luaparse.parse(source, {
      luaVersion: "5.2",
      ranges: true,
      locations: true,
      comments: true,
      scope: false,
      encodingMode: "none",
    });
    return { ok: true, ast };
  } catch (error) {
    const parseError = error as { message?: string; index?: number; line?: number; column?: number };
    const index = parseError.index ?? 0;
    return {
      ok: false,
      message: parseError.message ?? String(error),
      span: { start: index, end: index, line: parseError.line, column: parseError.column },
    };
  }
}
