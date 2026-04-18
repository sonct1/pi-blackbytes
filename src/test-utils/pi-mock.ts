import type { ExtensionAPI } from "../types/pi.js";

export interface MockPiCalls {
  registerTool: unknown[];
  registerCommand: unknown[];
  registerProvider: Array<{ name: string; opts: unknown }>;
  on: Array<{ event: string; handler: (...args: any[]) => void | Promise<void> }>;
  setActiveTools: unknown[][];
  appendEntry: unknown[];
}

export interface MockPi extends ExtensionAPI {
  registerTool(definition: unknown): void;
  registerCommand(definition: unknown): void;
  on(event: string, handler: (...args: any[]) => void | Promise<void>): void;
  setActiveTools(...args: unknown[]): void;
  appendEntry(...args: unknown[]): void;
  /** Recorded calls for assertions */
  calls: MockPiCalls;
  /** Trigger a registered event handler */
  emit(event: string, ...args: unknown[]): void | Promise<void>;
}

export function createMockPi(): MockPi {
  const calls: MockPiCalls = {
    registerTool: [],
    registerCommand: [],
    registerProvider: [],
    on: [],
    setActiveTools: [],
    appendEntry: [],
  };

  const handlers = new Map<string, Array<(...args: any[]) => void | Promise<void>>>();

  const mock: MockPi = {
    calls,

    registerTool(definition: unknown): void {
      calls.registerTool.push(definition);
    },

    registerCommand(definition: unknown): void {
      calls.registerCommand.push(definition);
    },

    registerProvider(name: string, opts: unknown): void {
      calls.registerProvider.push({ name, opts });
    },

    on(event: string, handler: (...args: any[]) => void | Promise<void>): void {
      calls.on.push({ event, handler });
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },

    setActiveTools(...args: unknown[]): void {
      calls.setActiveTools.push(args);
    },

    appendEntry(...args: unknown[]): void {
      calls.appendEntry.push(args);
    },

    emit(event: string, ...args: unknown[]): void | Promise<void> {
      const list = handlers.get(event);
      if (!list || list.length === 0) return;
      // Run all handlers; return a promise if any are async
      const results = list.map((h) => h(...args));
      const promises = results.filter((r): r is Promise<void> => r instanceof Promise);
      if (promises.length > 0) {
        return Promise.all(promises).then(() => undefined);
      }
    },
  };

  return mock;
}
