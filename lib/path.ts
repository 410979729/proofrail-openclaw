import { existsSync } from "fs";
import { isAbsolute, resolve } from "path";

function uniquePush(out: string[], seen: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const candidate = value.trim();
  if (!candidate || seen.has(candidate)) return;
  seen.add(candidate);
  out.push(candidate);
}

function extractPatchPaths(patchText: unknown): string[] {
  if (typeof patchText !== "string" || !patchText.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /^\*\*\*\s+(?:Update|Delete|Add)\s+File:\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(patchText)) !== null) {
    uniquePush(out, seen, match[1]);
  }
  return out;
}

export function getPathHints(
  input: Record<string, unknown>,
  derivedPaths?: readonly string[],
  options?: { includeCwd?: boolean },
): string[] {
  const includeCwd = options?.includeCwd !== false;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const derivedPath of derivedPaths || []) uniquePush(out, seen, derivedPath);
  for (const key of ["path", "filePath", "file", "target"]) uniquePush(out, seen, input[key]);
  if (includeCwd) uniquePush(out, seen, input.cwd);
  for (const patchPath of extractPatchPaths(input.patch)) uniquePush(out, seen, patchPath);

  return out;
}

export function mutationBaseDir(input: Record<string, unknown>, baseDir?: string): string | undefined {
  return typeof input.cwd === "string" && input.cwd.trim() ? input.cwd.trim() : baseDir;
}

export function pathExistsFromHint(pathHint: string, baseDir?: string): boolean {
  if (!pathHint || /^https?:\/\//i.test(pathHint)) return false;
  const resolvedPath = isAbsolute(pathHint) ? pathHint : resolve(baseDir || ".", pathHint);
  return existsSync(resolvedPath);
}

export function mutatesExistingPath(input: Record<string, unknown>, derivedPaths?: readonly string[], baseDir?: string): boolean {
  const hints = getPathHints(input, derivedPaths, { includeCwd: false });
  const effectiveBaseDir = mutationBaseDir(input, baseDir);
  return hints.some((pathHint) => pathExistsFromHint(pathHint, effectiveBaseDir));
}
