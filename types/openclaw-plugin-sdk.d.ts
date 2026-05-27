declare module "openclaw/plugin-sdk/plugin-entry" {
  export interface OpenClawPluginEntry {
    id: string;
    name?: string;
    description?: string;
    register(api: unknown): unknown;
  }

  export function definePluginEntry(entry: OpenClawPluginEntry): OpenClawPluginEntry;
}
