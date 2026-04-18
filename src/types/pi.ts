export interface CommandContext {
  ui: {
    select(opts: {
      message: string;
      options: Array<{ label: string; value: string }>;
    }): Promise<string>;
    input(opts: { message: string; placeholder?: string }): Promise<string>;
    confirm(opts: { message: string }): Promise<boolean>;
    notify(message: string, level?: "info" | "warn" | "error"): void;
  };
}

export interface ExtensionAPI {
  on(event: string, handler: (...args: any[]) => void | Promise<void>): void;
  registerTool(definition: any): void;
  registerProvider(name: string, opts: { headers?: Record<string, string> }): void;
  registerCommand(
    name: string,
    handler:
      | ((...args: any[]) => void | Promise<void>)
      | { handler: (args: string, ctx: CommandContext) => Promise<void> },
  ): void;
}
