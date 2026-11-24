import type { LuaLiteral } from "../../workflow/schema.ts";

/*
 * Shared IR between graph and Lua. Statements keep the node ID they came from
 * so the emitter can record source ranges for the return-import manifest.
 */

export type Expr =
  | { readonly kind: "literal"; readonly value: LuaLiteral }
  | { readonly kind: "name"; readonly name: string };

export type Statement =
  /**
   * Lua text, never reformatted. `verbatim` slices (imported) already carry
   * their own leading whitespace and are written exactly as stored.
   */
  | { readonly kind: "raw"; readonly nodeId: string; readonly source: string; readonly verbatim: boolean }
  /** Call of a custom script function; `results` are fresh locals (may be empty). */
  | {
      readonly kind: "call";
      readonly nodeId: string;
      readonly functionName: string;
      readonly args: readonly Expr[];
      readonly results: readonly string[];
    }
  | {
      readonly kind: "if";
      readonly nodeId: string;
      readonly condition: Expr;
      readonly then: Block;
      readonly else: Block;
    }
  | {
      readonly kind: "numericFor";
      readonly nodeId: string;
      readonly index: string;
      readonly start: Expr;
      readonly limit: Expr;
      readonly step: Expr | null;
      readonly body: Block;
    }
  | {
      readonly kind: "genericFor";
      readonly nodeId: string;
      readonly iterator: "ipairs" | "pairs";
      readonly key: string;
      readonly value: string;
      readonly source: Expr;
      readonly body: Block;
    }
  | { readonly kind: "break"; readonly nodeId: string }
  /**
   * Custom script function definition. Placed at top level right before the
   * first statement or event that uses it, so it sees every earlier local.
   */
  | { readonly kind: "function"; readonly nodeId: string; readonly fn: ScriptFunction };

export type Block = readonly Statement[];

export interface ScriptFunction {
  readonly nodeId: string;
  readonly revision: number;
  readonly name: string;
  readonly params: readonly string[];
  /** Function body exactly as the user wrote it. */
  readonly source: string;
}

export type TopLevelItem =
  | { readonly kind: "block"; readonly order: number; readonly statements: Block }
  | {
      readonly kind: "event";
      readonly nodeId: string;
      readonly order: number;
      readonly event: string;
      readonly params: readonly string[];
      /** Imported verbatim text around the body; generated when absent. */
      readonly header: string | null;
      readonly footer: string | null;
      readonly body: Block;
    };

export interface Program {
  readonly items: readonly TopLevelItem[];
  /** Imported text after the last statement; `null` means "end with one newline". */
  readonly trailer: string | null;
}
