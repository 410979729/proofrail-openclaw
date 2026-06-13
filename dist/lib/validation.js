"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changedPathHints = changedPathHints;
exports.suggestEvidence = suggestEvidence;
exports.suggestValidations = suggestValidations;
exports.summarizePaths = summarizePaths;
const path_1 = require("./path");
const text_1 = require("./text");
function shellQuote(value) {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}
const PY_SUFFIXES = new Set([".py"]);
const JS_SUFFIXES = new Set([".js", ".jsx", ".ts", ".tsx"]);
const SHELL_SUFFIXES = new Set([".sh", ".bash", ".zsh"]);
const YAML_SUFFIXES = new Set([".yaml", ".yml"]);
const JSON_SUFFIXES = new Set([".json"]);
const DOC_SUFFIXES = new Set([".md", ".rst", ".txt"]);
const SHELL_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
const REDIRECT_PREFIX_RE = /^(?<op>\d*(?:>>?|<<?)|&>|\d*>&)(?<target>.*)$/;
const PYTHON_EXECUTABLE_RE = /^(?:python(?:\d+(?:\.\d+)?)?|pythonw(?:\d+(?:\.\d+)?)?|pypy(?:\d+(?:\.\d+)?)?)$/i;
const WINDOWS_STYLE_SWITCH_RE = /^\/[A-Za-z][A-Za-z0-9?]*$/;
const WINDOWS_SWITCH_COMMANDS = new Set([
    "cmd",
    "cmd.exe",
    "powershell",
    "powershell.exe",
    "pwsh",
    "pwsh.exe",
    "reg",
    "reg.exe",
    "robocopy",
    "robocopy.exe",
    "sc",
    "sc.exe",
    "schtasks",
    "schtasks.exe",
    "taskkill",
    "taskkill.exe",
    "tasklist",
    "tasklist.exe",
    "wmic",
    "wmic.exe",
]);
function looksLikePath(value) {
    return Boolean(value) && !value.startsWith("-") && (value.includes("/") || /\.[A-Za-z0-9]+$/.test(value));
}
function shellSplit(command) {
    const out = [];
    let current = "";
    let quote = "";
    for (let index = 0; index < command.length; index += 1) {
        const char = command[index];
        if (quote) {
            if (char === quote) {
                quote = "";
            }
            else if (char === "\\" && quote === "\"" && index + 1 < command.length) {
                current += command[index + 1];
                index += 1;
            }
            else {
                current += char;
            }
            continue;
        }
        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }
        if (/\s/.test(char)) {
            if (current) {
                out.push(current);
                current = "";
            }
            continue;
        }
        current += char;
    }
    if (current)
        out.push(current);
    return out.length > 0 ? out : command.split(/\s+/).filter(Boolean);
}
function basename(value) {
    return value.trim().replace(/^['"]|['"]$/g, "").split(/[\\/]/).pop()?.toLowerCase() || "";
}
function isPythonExecutableToken(value) {
    return PYTHON_EXECUTABLE_RE.test(basename(value));
}
function isWindowsSwitchCommand(value) {
    return WINDOWS_SWITCH_COMMANDS.has(basename(value));
}
function pathCandidatesFromShellToken(rawValue, ignoreWindowsSwitches) {
    let value = rawValue.trim().replace(/^['"`.,;(){}[\]]+|['"`.,;(){}[\]]+$/g, "");
    if (!value || ["|", "||", "&", "&&", ";"].includes(value))
        return [];
    if (/^https?:\/\//i.test(value))
        return [];
    if (value.startsWith("-"))
        return [];
    if (ignoreWindowsSwitches && WINDOWS_STYLE_SWITCH_RE.test(value))
        return [];
    if (SHELL_ASSIGNMENT_RE.test(value))
        return [];
    if (value.startsWith("$") || value.startsWith("${"))
        return [];
    const redirectMatch = REDIRECT_PREFIX_RE.exec(value);
    if (redirectMatch?.groups) {
        const target = redirectMatch.groups.target.trim().replace(/^['"]|['"]$/g, "");
        if (!target || target.startsWith("&") || target.startsWith("$") || target === "/dev/null")
            return [];
        value = target;
    }
    const wrapperMatch = /^(?:PosixPath|WindowsPath|Path)\((['"])(.*?)\1\)$/.exec(value);
    if (wrapperMatch)
        value = wrapperMatch[2];
    if (value === "/dev/null" || value.startsWith("/dev/fd/"))
        return [];
    return looksLikePath(value) ? [value] : [];
}
function commandPathHints(command) {
    const parts = shellSplit(command);
    const out = [];
    const seen = new Set();
    let pythonArgMode = false;
    let skipNextPythonCode = false;
    const windowsSwitchMode = parts.length > 0 && isWindowsSwitchCommand(parts[0]);
    for (const rawPart of parts) {
        if (skipNextPythonCode) {
            skipNextPythonCode = false;
            pythonArgMode = false;
            continue;
        }
        if (isPythonExecutableToken(rawPart)) {
            pythonArgMode = true;
            continue;
        }
        if (pythonArgMode) {
            if (rawPart === "-c") {
                skipNextPythonCode = true;
                continue;
            }
            if (rawPart.startsWith("-c") && rawPart.length > 2) {
                pythonArgMode = false;
                continue;
            }
            if (rawPart.startsWith("-"))
                continue;
            pythonArgMode = false;
        }
        for (const candidate of pathCandidatesFromShellToken(rawPart, windowsSwitchMode)) {
            if (!seen.has(candidate)) {
                seen.add(candidate);
                out.push(candidate);
            }
        }
    }
    return out;
}
function unique(values) {
    return [...new Set(values.filter(Boolean))];
}
function changedPathHints(toolName, args, command = "") {
    const hints = (0, path_1.getPathHints)(args, undefined, { includeCwd: false });
    if (hints.length > 0)
        return hints;
    if (!command)
        return [];
    return unique(commandPathHints(command));
}
function suggestEvidence(params) {
    const paths = changedPathHints(params.toolName, params.args, params.command || "");
    const suggestions = [];
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
function suggestValidations(params) {
    const paths = changedPathHints(params.toolName, params.args, params.command || "");
    const suffixes = new Set(paths.map((path) => {
        const match = /\.[^./\\]+$/.exec(path);
        return match ? match[0].toLowerCase() : "";
    }));
    const names = new Set(paths.map((path) => path.split(/[\\/]/).pop()?.toLowerCase() || ""));
    const suggestions = [];
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
function summarizePaths(paths, limit = 8) {
    const out = paths.filter(Boolean).map((path) => (0, text_1.compactLabel)(path, 140));
    return out.length <= limit ? out : [...out.slice(0, limit), `... ${out.length - limit} more`];
}
