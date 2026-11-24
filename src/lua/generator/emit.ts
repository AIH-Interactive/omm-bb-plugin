import type { LuaLiteral } from "../../workflow/schema.ts";
import type { Block, Expr, Program, ScriptFunction, Statement } from "../ir/model.ts";

export const INDENT = "    ";

export interface ScriptRange {
  readonly nodeId: string;
  readonly revision: number;
  /** Offsets of the verbatim body inside the emitted file. */
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly bodyDigest: string;
}

export interface EmitResult {
  readonly source: string;
  readonly scripts: readonly ScriptRange[];
}

/** FNV-1a 32-bit over UTF-16 code units; detects edits, not tampering. */
export function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function beginMarker(nodeId: string, revision: number): string {
  return `--[[omm:begin ${nodeId} r${revision}]]`;
}

export function endMarker(nodeId: string): string {
  return `--[[omm:end ${nodeId}]]`;
}

export function luaLiteral(value: LuaLiteral): string {
  if (value === null) {
    return "nil";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return value > 0 ? "math.huge" : value < 0 ? "-math.huge" : "(0/0)";
    }
    return Object.is(value, -0) ? "-0" : String(value);
  }

  let quoted = '"';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === '"' || char === "\\") {
      quoted += `\\${char}`;
    } else if (char === "\n") {
      quoted += "\\n";
    } else if (char === "\r") {
      quoted += "\\r";
    } else if (char === "\t") {
      quoted += "\\t";
    } else if (code < 0x20 || code === 0x7f) {
      quoted += `\\${code.toString().padStart(3, "0")}`;
    } else {
      quoted += char;
    }
  }
  return `${quoted}"`;
}

function expr(value: Expr): string {
  return value.kind === "literal" ? luaLiteral(value.value) : value.name;
}

class Writer {
  text = "";
  readonly scripts: ScriptRange[] = [];

  /** Starts a generated line; the very first line of the file has no leading newline. */
  line(indent: number, content: string): void {
    this.text += `${this.text === "" ? "" : "\n"}${INDENT.repeat(indent)}${content}`;
  }

  /** Raw text that already carries its own leading whitespace is written as-is. */
  raw(indent: number, source: string): void {
    if (this.text === "" || /^[\r\n]/.test(source)) {
      this.text += source;
    } else {
      this.text += `\n${INDENT.repeat(indent)}${source}`;
    }
  }
}

function writeFunction(writer: Writer, fn: ScriptFunction): void {
  writer.line(0, beginMarker(fn.nodeId, fn.revision));
  writer.line(0, `local function ${fn.name}(${fn.params.join(", ")})`);
  writer.text += "\n";
  const bodyStart = writer.text.length;
  // The body is inserted literally; a trailing newline keeps a final comment from swallowing `end`.
  writer.text += fn.source;
  const bodyEnd = writer.text.length;
  if (!fn.source.endsWith("\n")) {
    writer.text += "\n";
  }
  writer.text += "end";
  writer.line(0, endMarker(fn.nodeId));
  writer.scripts.push({ nodeId: fn.nodeId, revision: fn.revision, bodyStart, bodyEnd, bodyDigest: digest(fn.source) });
}

function writeBlock(writer: Writer, block: Block, indent: number): void {
  for (const statement of block) {
    writeStatement(writer, statement, indent);
  }
}

function writeStatement(writer: Writer, statement: Statement, indent: number): void {
  switch (statement.kind) {
    case "raw":
      if (statement.verbatim) {
        writer.text += statement.source;
      } else {
        writer.raw(indent, statement.source);
      }
      return;
    case "call": {
      const call = `${statement.functionName}(${statement.args.map(expr).join(", ")})`;
      writer.line(indent, statement.results.length > 0 ? `local ${statement.results.join(", ")} = ${call}` : call);
      return;
    }
    case "if":
      writer.line(indent, `if ${expr(statement.condition)} then`);
      writeBlock(writer, statement.then, indent + 1);
      if (statement.else.length > 0) {
        writer.line(indent, "else");
        writeBlock(writer, statement.else, indent + 1);
      }
      writer.line(indent, "end");
      return;
    case "numericFor": {
      const step = statement.step === null ? "" : `, ${expr(statement.step)}`;
      writer.line(indent, `for ${statement.index} = ${expr(statement.start)}, ${expr(statement.limit)}${step} do`);
      writeBlock(writer, statement.body, indent + 1);
      writer.line(indent, "end");
      return;
    }
    case "genericFor":
      writer.line(indent, `for ${statement.key}, ${statement.value} in ${statement.iterator}(${expr(statement.source)}) do`);
      writeBlock(writer, statement.body, indent + 1);
      writer.line(indent, "end");
      return;
    case "break":
      writer.line(indent, "break");
      return;
    case "function":
      writeFunction(writer, statement.fn);
      return;
  }
}

export function emitLua(program: Program): EmitResult {
  const writer = new Writer();

  for (const item of program.items) {
    if (item.kind === "block") {
      writeBlock(writer, item.statements, 0);
      continue;
    }

    if (item.header !== null) {
      writer.text += item.header;
    } else {
      writer.line(0, `events.${item.event}:register(function(${item.params.join(", ")})`);
    }
    writeBlock(writer, item.body, 1);
    if (item.footer !== null) {
      writer.text += item.footer;
    } else {
      writer.line(0, "end)");
    }
  }

  if (program.trailer !== null) {
    writer.text += program.trailer;
  } else if (writer.text !== "" && !writer.text.endsWith("\n")) {
    writer.text += "\n";
  }
  return { source: writer.text, scripts: writer.scripts };
}
