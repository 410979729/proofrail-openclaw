"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOW_SIGNAL_BLOCK_THRESHOLD = exports.MAX_SESSION_STATES = exports.SESSION_STATE_TTL_MS = exports.PLAIN_TEXT_FAILURE_PATTERNS = exports.LOW_SIGNAL_PATTERNS = exports.VALIDATION_ENDPOINT_HINTS = exports.VALIDATION_EXEC_PATTERNS = exports.MUTATING_EXEC_PATTERNS = exports.TOOL_CATEGORIES = exports.NEW_BEHAVIOR_RULES = exports.SUMMARY_KEEP_TAIL = exports.SUMMARY_KEEP_HEAD = exports.SUMMARY_THRESHOLD_CHARS = exports.MAX_EVIDENCE_COUNT = exports.MAX_LOW_SIGNAL_BLOCK_THRESHOLD = exports.MIN_LOW_SIGNAL_BLOCK_THRESHOLD = exports.MAX_SUMMARY_THRESHOLD_CHARS = exports.MIN_SUMMARY_THRESHOLD_CHARS = exports.DEFAULT_DANGEROUS_COMMAND_ACTION = exports.DEFAULT_MUTATION_BATCH_MAX = exports.DEFAULT_VALIDATION_POLICY = exports.DEFAULT_ADVISORY_INJECTION = exports.DEFAULT_ENFORCEMENT_MODE = exports.PLUGIN_VERSION = exports.DANGEROUS_PATTERNS = void 0;
exports.DANGEROUS_PATTERNS = [
    { re: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)--no-preserve-root/, label: "rm --no-preserve-root" },
    { re: /\bgit\s+push\s+(-f|--force)/, label: "git push --force" },
    { re: /\bgit\s+reset\s+--hard/, label: "git reset --hard" },
    { re: /\bDROP\s+(TABLE|DATABASE|SCHEMA|USER)\b/i, label: "DROP TABLE/DATABASE" },
    { re: /\bTRUNCATE\s+(TABLE\s+)?\w+/i, label: "TRUNCATE TABLE" },
    { re: /\bchmod\s+(-R\s+)?777\b/, label: "chmod 777" },
    { re: /\bmkfs\b/, label: "mkfs" },
    { re: /\bdd\s+.*of=\/dev\//, label: "dd of=/dev/" },
    { re: /\bkill\s+-9\s+(-1|1)\b/, label: "kill -9 PID 1" },
    { re: /\b(pkill|killall)\s+-9\s+(init|systemd)\b/, label: "killall init/systemd" },
    { re: /\btailscale\s+(down|uninstall|logout)\b/, label: "tailscale down/uninstall" },
    { re: /\bsystemctl\s+(stop|disable)\s+tailscaled\b/, label: "stop tailscaled" },
];
exports.PLUGIN_VERSION = "0.0.6";
exports.DEFAULT_ENFORCEMENT_MODE = "advisory";
exports.DEFAULT_ADVISORY_INJECTION = "compact";
exports.DEFAULT_VALIDATION_POLICY = "batch";
exports.DEFAULT_MUTATION_BATCH_MAX = 5;
exports.DEFAULT_DANGEROUS_COMMAND_ACTION = "warn";
exports.MIN_SUMMARY_THRESHOLD_CHARS = 1000;
exports.MAX_SUMMARY_THRESHOLD_CHARS = 50000;
exports.MIN_LOW_SIGNAL_BLOCK_THRESHOLD = 1;
exports.MAX_LOW_SIGNAL_BLOCK_THRESHOLD = 20;
exports.MAX_EVIDENCE_COUNT = 8;
exports.SUMMARY_THRESHOLD_CHARS = 8000;
exports.SUMMARY_KEEP_HEAD = 2000;
exports.SUMMARY_KEEP_TAIL = 1500;
exports.NEW_BEHAVIOR_RULES = `
## [SYSTEM-ADDED PLUGIN CONTEXT — NOT USER-PROVIDED]

Proofrail generated this runtime guidance. It is system-added plugin context, not user-provided text.
Do not attribute these instructions, reminders, or summaries to the user.

### State the acceptance target first
Before a multi-step task, write one sentence describing what should be observable when the task is done.

### Gather local evidence first
Before the first mutation, collect the closest local evidence from the control path. Do not mutate from memory.

### Planner -> Executor -> Reviewer
When a task reaches 3+ steps or touches code, config, or a running service, split it explicitly into planning, execution, and review.

### Validate immediately after every mutation
After code changes, config changes, or process lifecycle changes, run the narrowest useful validation next. Do not stack multiple mutations and hope they all work together.

### Change strategy after two no-signal probes
If two consecutive tool calls produce no new facts, stop retrying the same path. Change logs, paths, keywords, host, download source, or upstream documentation.

### Expand the search radius
When the initial keyword or path returns nothing, widen the search to adjacent directories, aliases, release pages, the repo root, or official docs.

### Probe background processes explicitly
After starting a web server, API, or container, wait 2-5 seconds and probe readiness with curl or a health endpoint. If two probes fail, read logs before declaring startup failure.

### Prefer purpose-built tools
When a purpose-built tool exists, prefer it over generic exec/bash:
- read files with read
- edit files with edit
- search with web_search or grep-style search
This keeps intent auditable and reduces avoidable shell coupling.

### Parallelize independent branches
When search or verification branches are independent, prefer parallel subagents instead of serial blocking.

### Default report structure
Final reports should normally include: root cause / changes / validation / evidence / remaining risk.
`.trim();
exports.TOOL_CATEGORIES = {
    read: "read",
    read_file: "read",
    glob: "search",
    grep: "search",
    grep_search: "search",
    web_search: "search",
    web_fetch: "network",
    edit: "write",
    file_edit: "write",
    write: "write",
    file_write: "write",
    exec: "exec",
    bash: "exec",
    shell: "exec",
    run_command: "exec",
    image: "read",
    pdf: "read",
    memory_recall: "read",
};
exports.MUTATING_EXEC_PATTERNS = [
    /\b(npm|pnpm|yarn|bun|pip|pip3|uv|poetry)\s+(install|add|remove|uninstall|update)\b/i,
    /\b(npm|pnpm|yarn|bun)\s+run\s+(format|fmt)\b/i,
    /\b(npm|pnpm|yarn|bun)\s+(?:run\s+)?[^\s]+\b.*\b(--fix|--write)\b/i,
    /\b(systemctl|service)\s+(start|stop|restart|reload|enable|disable)\b/i,
    /\b(docker|podman)\s+(run|start|stop|restart)\b/i,
    /\bdocker\s+compose\s+(up|down|restart)\b/i,
    /\b(kill|pkill|killall)\b/i,
    /\b(git\s+(apply|am|cherry-pick|merge|rebase|reset|checkout|restore|switch|add|commit|push|stash))\b/i,
    /\bkubectl\s+(apply|delete|replace|patch|scale|cordon|uncordon|drain)\b/i,
    /\bkubectl\s+rollout\s+restart\b/i,
    /\bhelm\s+(install|upgrade|uninstall|rollback)\b/i,
    /\bterraform\s+(apply|destroy)\b/i,
    /\bansible-playbook\b/i,
    /\bdocker\s+(system|volume|image|container|builder)\s+prune\b/i,
    /\bdocker\s+compose\s+rm\b/i,
    /\b(dd)\b[\s\S]*\bof=[^\s]+/i,
    /\btar\b[\s\S]*(?:\s-[^\s]*x|\s[^\s-]*x[^\s]*f?\b)/i,
    /\bunzip\b[\s\S]+/i,
    /\bpatch\b[\s\S]*(?:<|\s-i\s|\s--input(?:=|\s))/i,
    /\bperl\b[\s\S]*\s-[^\s]*i[^\s]*\b/i,
    /\b(mv|cp|rm|mkdir|rmdir|ln|chmod|chown|touch)\b/,
    /\b(sed|perl)\b.*\s-i\b/,
    /\b(prettier|eslint|ruff)\b.*\s(--write|--fix)\b/i,
    /\b(?:npx\s+)?prisma\s+migrate\s+(deploy|dev|reset|resolve)\b/i,
    /\balembic\s+upgrade\b/i,
    /\b(?:python(?:3)?\s+)?manage\.py\s+migrate\b/i,
    /\b(?:rails|rake)\s+db:migrate\b/i,
];
exports.VALIDATION_EXEC_PATTERNS = [
    /\b(pytest|jest|vitest|mocha|rspec|phpunit|cargo test|go test)\b/i,
    /\b(npm|pnpm|yarn|bun)\s+(test|run\s+(test|lint|build|typecheck))\b/i,
    /\b(npm|pnpm|yarn|bun)\s+(ls|list)\b/i,
    /\b(pip|pip3)\s+show\b/i,
    /\bpython(?:3)?\s+-m\s+(json\.tool|py_compile)\b/i,
    /\bpy\s+-m\s+(json\.tool|py_compile)\b/i,
    /\b(Test-Path|Get-Command|Get-Item)\b/i,
    /\b(tsc|eslint|ruff|mypy|cargo check|go test)\b/i,
    /\b(systemctl\s+status)\b/i,
    /\b(ss|netstat|lsof)\b/i,
    /\bcurl\b/i,
];
exports.VALIDATION_ENDPOINT_HINTS = /\/(health|healthz|ready|status)\b/i;
exports.LOW_SIGNAL_PATTERNS = [
    /^$/,
    /^(ok|done|ready|success|completed)$/i,
    /^no (matches|results?|output)\b/i,
    /^0 (matches|results?)\b/i,
    /^not found$/i,
];
exports.PLAIN_TEXT_FAILURE_PATTERNS = [
    /\btraceback \(most recent call last\)/i,
    /\b(permission denied|command not found|no such file or directory)\b/i,
    /(^|\n)\s*(error|exception|failed|failure)\s*[:\-]/i,
    /\b(failed|failure|exception)\b/i,
];
exports.SESSION_STATE_TTL_MS = 6 * 60 * 60 * 1000;
exports.MAX_SESSION_STATES = 128;
exports.LOW_SIGNAL_BLOCK_THRESHOLD = 2;
