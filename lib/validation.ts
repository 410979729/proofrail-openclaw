import { getPathHints } from "./path";
import { compactLabel } from "./text";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

const PY_SUFFIXES = new Set([".py"]);
const JS_SUFFIXES = new Set([".js", ".jsx", ".ts", ".tsx"]);
const SHELL_SUFFIXES = new Set([".sh", ".bash", ".zsh"]);
const YAML_SUFFIXES = new Set([".yaml", ".yml"]);
const JSON_SUFFIXES = new Set([".json"]);
const DOC_SUFFIXES = new Set([".md", ".rst", ".txt"]);

function looksLikePath(value: string): boolean {
  return Boolean(value) && !value.startsWith("-") && (value.includes("/") || /\.[A-Za-z0-9]+$/.test(value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function changedPathHints(toolName: string, args: Record<string, unknown>, command = ""): string[] {
  const hints = getPathHints(args, undefined, { includeCwd: false });
  if (hints.length > 0) return hints;
  if (!command) return [];
  return unique(command.split(/\s+/).map((part) => part.replace(/^['"]|['"]$/g, "")).filter(looksLikePath));
}

export function suggestEvidence(params: {
  toolName: string;
  args: Record<string, unknown>;
  command?: string;
  mutatingExec?: boolean;
}): string[] {
  const paths = changedPathHints(params.toolName, params.args, params.command || "");
  const suggestions: string[] = [];

  for (const path of paths.slice(0, 2)) {
    suggestions.push(`read ${shellQuote(path)}`);
    suggestions.push(`grep -n ${shellQuote(path.split(/[\\/]/).pop() || path)} ${shellQuote(path)}`);
    suggestions.push(`ls -l ${shellQuote(path)}`);
  }

  if (params.toolName === "exec" || params.mutatingExec) {
    suggestions.push("read nearby config / source / test files on the same control path before retrying the command");
    suggestions.push("journalctl -u <related service> -n 50 --no-pager");
    suggestions.push("curl -fsS --max-time 5 http://127.0.0.1:<port>/healthz");
  }

  if (paths.length === 0) {
    suggestions.push("read the closest code, config, log, or test file tied to the blocked target");
    suggestions.push("grep for the target name in the repo root or adjacent directories");
  }

  return unique(suggestions).slice(0, 8);
}

export function suggestValidations(params: {
  toolName: string;
  args: Record<string, unknown>;
  command?: string;
  mutatingExec?: boolean;
}): string[] {
  const paths = changedPathHints(params.toolName, params.args, params.command || "");
  const suffixes = new Set(paths.map((path) => {
    const match = /\.[^./\\]+$/.exec(path);
    return match ? match[0].toLowerCase() : "";
  }));
  const names = new Set(paths.map((path) => path.split(/[\\/]/).pop()?.toLowerCase() || ""));
  const suggestions: string[] = [];

  if ([...suffixes].some((suffix) => PY_SUFFIXES.has(suffix)) || names.has("pyproject.toml")) {
    suggestions.push("python -m py_compile <changed .py files>", "pytest -q");
  }
  if (names.has("plugin.yaml") || [...suffixes].some((suffix) => YAML_SUFFIXES.has(suffix))) {
    suggestions.push('python -c "import yaml; yaml.safe_load(open(\'<changed yaml>\'))"');
  }
  if (names.has("pyproject.toml")) {
    suggestions.push('python -c "import tomllib; tomllib.load(open(\'pyproject.toml\',\'rb\'))"');
    suggestions.push("python scripts/check.release.py");
  }
  if ([...suffixes].some((suffix) => JSON_SUFFIXES.has(suffix))) {
    suggestions.push("python -m json.tool <changed json>");
  }
  if ([...suffixes].some((suffix) => SHELL_SUFFIXES.has(suffix))) {
    suggestions.push("bash -n <changed shell script>");
  }
  if ([...suffixes].some((suffix) => JS_SUFFIXES.has(suffix)) || ["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock"].some((name) => names.has(name))) {
    suggestions.push("npm test or pnpm test, plus project lint/build if available");
  }
  if (suffixes.size > 0 && [...suffixes].every((suffix) => DOC_SUFFIXES.has(suffix))) {
    suggestions.push("review rendered docs / links if docs changed only");
  }
  if (params.mutatingExec && suggestions.length === 0) {
    suggestions.push("run the narrowest command that proves the mutation worked");
  }

  return unique(suggestions);
}

export function summarizePaths(paths: readonly string[], limit = 8): string[] {
  const out = paths.filter(Boolean).map((path) => compactLabel(path, 140));
  return out.length <= limit ? out : [...out.slice(0, limit), `... ${out.length - limit} more`];
}
