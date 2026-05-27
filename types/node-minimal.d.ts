declare module "fs" {
  export function appendFileSync(path: string, data: string, options?: unknown): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: unknown): unknown;
  export function writeFileSync(path: string, data: string, options?: unknown): void;
}

declare module "path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
  export function resolve(...paths: string[]): string;
}
