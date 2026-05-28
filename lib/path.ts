import { existsSync } from "fs";
import { isAbsolute, resolve, sep } from "path";

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

function resolvePathHint(pathHint: string, baseDir?: string): string | undefined {
  if (!pathHint || /^https?:\/\//i.test(pathHint)) return undefined;
  return isAbsolute(pathHint) ? resolve(pathHint) : resolve(baseDir || ".", pathHint);
}

function pathContains(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}${sep}`);
}

export function readbackPathsValidateTouchedPaths(touchedHints: readonly string[], readbackHints: readonly string[], baseDir?: string): boolean {
  const touchedPaths = touchedHints
    .map((pathHint) => resolvePathHint(pathHint, baseDir))
    .filter((value): value is string => Boolean(value));
  const readbackPaths = readbackHints
    .map((pathHint) => resolvePathHint(pathHint, baseDir))
    .filter((value): value is string => Boolean(value));

  if (touchedPaths.length === 0 || readbackPaths.length === 0) return false;
  return readbackPaths.some((readbackPath) => touchedPaths.some((touchedPath) => pathContains(readbackPath, touchedPath)));
}

export function pathHintsOverlap(leftHints: readonly string[], rightHints: readonly string[], baseDir?: string): boolean {
  const leftPaths = leftHints
    .map((pathHint) => resolvePathHint(pathHint, baseDir))
    .filter((value): value is string => Boolean(value));
  const rightPaths = rightHints
    .map((pathHint) => resolvePathHint(pathHint, baseDir))
    .filter((value): value is string => Boolean(value));

  if (leftPaths.length === 0 || rightPaths.length === 0) return false;
  return leftPaths.some((leftPath) => rightPaths.some((rightPath) => pathContains(leftPath, rightPath) || pathContains(rightPath, leftPath)));
}

export function mutatesExistingPath(input: Record<string, unknown>, derivedPaths?: readonly string[], baseDir?: string): boolean {
  const hints = getPathHints(input, derivedPaths, { includeCwd: false });
  const effectiveBaseDir = mutationBaseDir(input, baseDir);
  return hints.some((pathHint) => pathExistsFromHint(pathHint, effectiveBaseDir));
}
