import {
  DANGEROUS_PATTERNS,
  MUTATING_EXEC_PATTERNS,
  VALIDATION_ENDPOINT_HINTS,
  VALIDATION_EXEC_PATTERNS,
} from "./constants";

export interface CommandRiskResult {
  dangerous: boolean;
  label?: string;
}

function hasShortFlag(command: string, flag: string): boolean {
  return new RegExp(`(^|\\s)-[a-z]*${flag}[a-z]*(?=\\s|$)`, "i").test(command);
}

function hasLongFlag(command: string, flag: string): boolean {
  return new RegExp(`(^|\\s)--${flag}(?=\\s|$)`, "i").test(command);
}

function splitShellSegments(command: string): string[] {
  return command
    .split(/\s*(?:&&|\|\||;)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseQuotedPayload(command: string, startIndex: number, quote: string): { payload?: string; endIndex: number } {
  let index = startIndex + 1;
  let payload = "";

  while (index < command.length) {
    const char = command[index];

    if (quote === '"' && char === "\\" && index + 1 < command.length) {
      payload += command[index + 1];
      index += 2;
      continue;
    }

    if (char === quote) {
      return {
        payload: payload.trim(),
        endIndex: index + 1,
      };
    }

    payload += char;
    index += 1;
  }

  return { endIndex: command.length };
}

function readShellToken(command: string, startIndex: number): { value?: string; endIndex: number } {
  let index = startIndex;
  while (index < command.length && /\s/.test(command[index])) index += 1;
  if (index >= command.length) return { endIndex: index };

  const firstChar = command[index];
  if (firstChar === '"' || firstChar === "'") {
    const parsed = parseQuotedPayload(command, index, firstChar);
    return {
      value: parsed.payload,
      endIndex: parsed.endIndex,
    };
  }

  let value = "";
  while (index < command.length && !/\s/.test(command[index])) {
    const char = command[index];

    if (char === "\\" && index + 1 < command.length) {
      value += command[index + 1];
      index += 2;
      continue;
    }

    if (char === '"' || char === "'") {
      const parsed = parseQuotedPayload(command, index, char);
      if (parsed.payload) value += parsed.payload;
      index = parsed.endIndex;
      continue;
    }

    value += char;
    index += 1;
  }

  return {
    value: value.trim(),
    endIndex: index,
  };
}

function splitShellOptionToken(token: string): { name: string; inlineValue?: string } {
  if (!token.startsWith("-")) return { name: token };

  const equalsIndex = token.indexOf("=");
  if (equalsIndex < 0) return { name: token };

  const name = token.slice(0, equalsIndex);
  const inlineValue = token.slice(equalsIndex + 1).trim();
  return {
    name,
    inlineValue: inlineValue || undefined,
  };
}

function isShellCommandFlag(token: string): boolean {
  return /^-[a-z]*c[a-z]*$/i.test(token)
    || token === "--command"
    || token === "--init-command";
}

function shortOptionTokenConsumesNextValue(token: string): boolean {
  if (!/^[-+][A-Za-z]+$/.test(token)) return false;
  return token.includes("o") || token.includes("O");
}

function shellOptionConsumesValue(token: string): boolean {
  return token === "-o"
    || token === "+o"
    || token === "-O"
    || token === "+O"
    || token === "--rcfile"
    || token === "--init-file";
}

function getNestedShellPayloads(command: string): string[] {
  const payloads: string[] = [];
  const nestedShellPattern = /\b(?:bash|sh|zsh|fish)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = nestedShellPattern.exec(command)) !== null) {
    let index = nestedShellPattern.lastIndex;
    let sawCommandFlag = false;

    while (index < command.length) {
      const token = readShellToken(command, index);
      if (!token.value) break;
      index = token.endIndex;
      const shellOption = splitShellOptionToken(token.value);

      if (!sawCommandFlag) {
        if (isShellCommandFlag(shellOption.name)) {
          if (shellOption.inlineValue) {
            payloads.push(shellOption.inlineValue);
            nestedShellPattern.lastIndex = Math.max(nestedShellPattern.lastIndex, index);
            break;
          }
          sawCommandFlag = true;
          continue;
        }

        if (shellOptionConsumesValue(shellOption.name) || shortOptionTokenConsumesNextValue(shellOption.name)) {
          if (!shellOption.inlineValue) {
            const arg = readShellToken(command, index);
            index = arg.endIndex;
          }
          continue;
        }

        if (shellOption.name.startsWith("-")) continue;
        break;
      }

      payloads.push(token.value.trim());
      nestedShellPattern.lastIndex = Math.max(nestedShellPattern.lastIndex, index);
      break;
    }
  }

  return payloads;
}

function isLikelyScriptedFixExec(command: string): boolean {
  if (!/\b(npm|pnpm|yarn|bun)\s+(?:run\s+)?[^\s]+\b/i.test(command)) return false;
  return /(^|\s)--(?:fix|write)(?=\s|$)/i.test(command);
}

function getDangerousRmLabel(command: string): string | undefined {
  if (!/\brm\b/i.test(command)) return undefined;

  const hasRecursive = hasShortFlag(command, "r") || hasLongFlag(command, "recursive");
  const hasForce = hasShortFlag(command, "f") || hasLongFlag(command, "force");
  if (!hasRecursive || !hasForce) return undefined;

  if (/(^|\s)(["'])?\/(?:\*+)?\2(?=\s|$)/.test(command)) return "rm -rf /";
  if (/(^|\s)(["'])?\/\.\*(?:\/(?:\*+)?)?\2(?=\s|$)/.test(command)) return "rm -rf root hidden files";
  if (/(^|\s)\.\[!\.\]\*\s+\.\.\?\*\s+\*(?=\s|$)/.test(command)) return "rm -rf all current directory contents";
  if (/(^|\s)(["'])?\*(?:\/(?:\*+)?)?\2(?=\s|$)/.test(command)) return "rm -rf current directory contents";
  if (/(^|\s)(["'])?\.\/\*(?:\/(?:\*+)?)?\2(?=\s|$)/.test(command)) return "rm -rf current directory contents";
  if (/(^|\s)(["'])?\.\*(?:\/(?:\*+)?)?\2(?=\s|$)/.test(command)) return "rm -rf hidden files";
  if (/(^|\s)(["'])?\.\/\.\*(?:\/(?:\*+)?)?\2(?=\s|$)/.test(command)) return "rm -rf hidden files";
  if (/(^|\s)(["'])?\.(?:\/(?:\*+)?)?\2(?=\s|$)/.test(command)) return "rm -rf current directory";
  if (/(^|\s)(["'])?\$PWD\2(?:\/(?:\*)?)?(?=\s|$)/.test(command)) return "rm -rf $PWD";
  if (/(^|\s)(["'])?\$\{PWD\}\2(?:\/(?:\*)?)?(?=\s|$)/.test(command)) return "rm -rf ${PWD}";
  if (/\$\(\s*pwd\s*\)(?:\/(?:\*)?)?/i.test(command)) return "rm -rf $(pwd)";
  if (/(^|\s)(["'])?\$HOME\2(?:\/(?:\*)?)?(?=\s|$)/.test(command)) return "rm -rf $HOME";
  if (/(^|\s)(["'])?\$\{HOME\}\2(?:\/(?:\*)?)?(?=\s|$)/.test(command)) return "rm -rf ${HOME}";
  if (/(^|\s)(["'])?~(?:\/(?:\*+)?)?\2(?=\s|$)/.test(command)) return "rm -rf home directory";
  if (/(^|\s)(["'])?\.\.(?:\/[^\s"']*)?\2(?=\s|$)/.test(command)) return "rm -rf parent directory";
  if (/(^|\s)(["'])?\.\/\.\.(?:\/[^\s"']*)?\2(?=\s|$)/.test(command)) return "rm -rf parent directory";
  return undefined;
}

function getDangerousGitCleanLabel(command: string): string | undefined {
  if (!/\bgit\s+clean\b/i.test(command)) return undefined;

  const hasForce = hasShortFlag(command, "f") || hasLongFlag(command, "force");
  const hasDir = hasShortFlag(command, "d") || hasLongFlag(command, "dir");
  const hasIgnored = hasShortFlag(command, "x");
  const dryRun = hasShortFlag(command, "n") || hasLongFlag(command, "dry-run");

  if (!hasForce || !hasDir || dryRun) return undefined;
  if (hasIgnored) return "git clean -fdx";
  return "git clean -fd";
}

function isFindPreludeOption(token: string): boolean {
  return /^(?:-H|-L|-P)$/.test(token)
    || /^-O\d*$/.test(token)
    || token === "-D";
}

function getFindStartPoints(command: string): string[] {
  const match = /\bfind\b/i.exec(command);
  if (!match) return ["."];

  const targets: string[] = [];
  let index = match.index + match[0].length;

  while (index < command.length) {
    const token = readShellToken(command, index);
    if (!token.value) break;
    index = token.endIndex;

    const value = token.value.trim();
    if (!value) continue;

    if (isFindPreludeOption(value)) {
      if (value === "-D") {
        const arg = readShellToken(command, index);
        index = arg.endIndex;
      }
      continue;
    }

    if (value.startsWith("-") || value === "!" || value === "(" || value === ")") {
      break;
    }

    targets.push(value);
  }

  return targets.length > 0 ? targets : ["."];
}

function getDangerousFindStartPointLabel(target: string, operation: "-delete" | "-exec rm"): string | undefined {
  if (/^\/$/.test(target)) return `find / ${operation}`;
  if (/^\.(?:\/)?$/.test(target) || /^\.\/\.(?:\/)?$/.test(target)) return `find . ${operation}`;
  if (/^\.\.(?:\/)?$/.test(target) || /^\.\/\.\.(?:\/)?$/.test(target)) return `find parent directory ${operation}`;
  if (/^\$PWD\/?$/.test(target)) return `find $PWD ${operation}`;
  if (/^\$\{PWD\}\/?$/.test(target)) return "find ${PWD} " + operation;
  if (/^\$HOME\/?$/.test(target)) return `find $HOME ${operation}`;
  if (/^\$\{HOME\}\/?$/.test(target)) return "find ${HOME} " + operation;
  if (/^~\/?$/.test(target)) return `find home directory ${operation}`;
  return undefined;
}

function getDangerousFindDeleteLabel(command: string): string | undefined {
  if (!/\bfind\b/i.test(command)) return undefined;
  if (!/(^|\s)-delete(?=\s|$)/i.test(command)) return undefined;

  for (const target of getFindStartPoints(command)) {
    const label = getDangerousFindStartPointLabel(target, "-delete");
    if (label) return label;
  }

  return undefined;
}

function getDangerousFindExecRmLabel(command: string): string | undefined {
  if (!/\bfind\b/i.test(command)) return undefined;
  if (!/(^|\s)-exec(?:dir)?\s+(?:\/bin\/)?rm\b/i.test(command)) return undefined;

  for (const target of getFindStartPoints(command)) {
    const label = getDangerousFindStartPointLabel(target, "-exec rm");
    if (label) return label;
  }

  return undefined;
}

function getDangerousXargsRmLabel(command: string): string | undefined {
  if (!/\bxargs\b[\s\S]*\brm\b/i.test(command)) return undefined;
  const hasRecursive = hasShortFlag(command, "r") || hasLongFlag(command, "recursive");
  const hasForce = hasShortFlag(command, "f") || hasLongFlag(command, "force");
  if (hasRecursive && hasForce) return "xargs rm -rf";
  return undefined;
}

function getDangerousScriptOneLinerLabel(command: string): string | undefined {
  if (/\bpython(?:3)?\s+-c\s+["'][\s\S]*(?:shutil\.rmtree|os\.remove|os\.unlink)[\s\S]*\(["']\/["']/i.test(command)) {
    return "python destructive one-liner";
  }

  if (/\bnode\s+-e\s+["'][\s\S]*(?:rmSync|rmdirSync|unlinkSync)[\s\S]*\(["']\/["']/i.test(command)) {
    return "node destructive one-liner";
  }

  return undefined;
}

function getDangerousScriptHereDocLabel(command: string): string | undefined {
  if (/\bpython(?:3)?\b[\s\S]*<<[\s\S]*(?:shutil\.rmtree|os\.remove|os\.unlink|os\.rmdir)[\s\S]*["']\/["']/i.test(command)) {
    return "python destructive heredoc";
  }

  if (/\bnode\b[\s\S]*<<[\s\S]*(?:rmSync|rmdirSync|unlinkSync)[\s\S]*["']\/["']/i.test(command)) {
    return "node destructive heredoc";
  }

  return undefined;
}

function getDangerousRemoteScriptLabel(command: string): string | undefined {
  const shellInvoker = String.raw`(?:(?:sudo\s+)?(?:(?:\/usr\/bin\/)?env\s+)?(?:\/bin\/|\/usr\/bin\/)?(?:sh|bash|zsh|fish)\b)`;

  const pipeToShell = new RegExp(String.raw`\b(curl|wget)\b[\s\S]*\|\s*${shellInvoker}`, "i");
  if (pipeToShell.test(command)) {
    return "curl/wget pipe to shell";
  }

  const processSubShell = new RegExp(String.raw`\b(?:\/bin\/|\/usr\/bin\/)?(?:sh|bash|zsh|fish)\b[\s\S]*<\(\s*(?:curl|wget)\b`, "i");
  if (processSubShell.test(command)) {
    return "remote script process substitution";
  }

  if (/\b(?:source|\.)\s+<\(\s*(?:curl|wget)\b/i.test(command)) {
    return "source remote script process substitution";
  }

  return undefined;
}

function sshOptionConsumesValue(token: string): boolean {
  const option = splitShellOptionToken(token);
  if (option.inlineValue) return false;
  return /^(?:-[bcDeFIiJLlmOopQRSWw]|-o|-F|-i|-J|-L|-R|-S|-W|-b|-c|-l|-m|-p|-Q)$/.test(option.name)
    || /^(?:--config|--identity-file|--jump|--login-name|--port)=?$/.test(option.name);
}

function getSshRemotePayloads(command: string): string[] {
  const payloads: string[] = [];
  const sshPattern = /\bssh\b/gi;
  let match: RegExpExecArray | null;

  while ((match = sshPattern.exec(command)) !== null) {
    let index = sshPattern.lastIndex;
    let sawHost = false;
    const payloadTokens: string[] = [];

    while (index < command.length) {
      const token = readShellToken(command, index);
      if (!token.value) break;
      index = token.endIndex;
      const value = token.value.trim();
      if (!value) continue;

      if (!sawHost) {
        if (value === "--") continue;
        if (sshOptionConsumesValue(value)) {
          const arg = readShellToken(command, index);
          index = arg.endIndex;
          continue;
        }
        if (value.startsWith("-")) continue;
        sawHost = true;
        continue;
      }

      payloadTokens.push(value);
    }

    const payload = payloadTokens.join(" ").trim();
    if (payload) payloads.push(payload);
    sshPattern.lastIndex = Math.max(sshPattern.lastIndex, index);
  }

  return payloads;
}

function hasToolDryRunFlag(command: string, tool: "kubectl" | "helm"): boolean {
  if (tool === "kubectl") return /(^|\s)--dry-run(?:=\S+)?(?=\s|$)/i.test(command);
  return /(^|\s)--dry-run(?=\s|$)/i.test(command);
}

function getDangerousInfrastructureLabel(command: string): string | undefined {
  if (/\bterraform\s+destroy\b/i.test(command)) return "terraform destroy";
  if (/\bkubectl\s+delete\s+(?:namespace|ns|all|clusterrole|clusterrolebinding)\b/i.test(command) && !hasToolDryRunFlag(command, "kubectl")) return "kubectl destructive delete";
  if (/\bhelm\s+(?:uninstall|delete)\b/i.test(command) && !hasToolDryRunFlag(command, "helm")) return "helm uninstall/delete";
  if (/\bdocker\s+(?:system|volume|image|container|builder)\s+prune\b/i.test(command)) return "docker prune";
  return undefined;
}

function normalizeShellPathToken(token: string): string {
  return token.trim().replace(/^['"]|['"]$/g, "");
}

function isBenignWriteSink(target: string): boolean {
  const normalized = normalizeShellPathToken(target);
  return /^(?:\/dev\/(?:null|stdout|stderr)|\/proc\/self\/fd\/[12])$/i.test(normalized);
}

function hasShellWriteRedirection(command: string): boolean {
  // > file, >> file, 1> file, 2> file, &> file. Ignore descriptor dupes and benign sinks like /dev/null.
  const redirectionPattern = /(^|[\s;&|])(?:\d*>>?|&>)(?!&)/g;
  let match: RegExpExecArray | null;

  while ((match = redirectionPattern.exec(command)) !== null) {
    const token = readShellToken(command, match.index + match[0].length);
    const target = token.value?.trim();
    if (!target) return true;
    if (/^&\d+$/.test(target)) continue;
    if (isBenignWriteSink(target)) continue;
    return true;
  }

  return false;
}

function hasTeeWrite(command: string): boolean {
  const teePattern = /(^|[\s;&|])tee(?=\s|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = teePattern.exec(command)) !== null) {
    let index = match.index + match[0].length;
    while (index < command.length) {
      const token = readShellToken(command, index);
      if (!token.value) break;
      index = token.endIndex;
      const value = token.value.trim();
      if (!value) continue;
      if (value === "|" || value === ";" || value === "&&" || value === "||") break;
      if (value === "--") continue;
      if (value.startsWith("-")) continue;
      if (value === "-") continue;
      if (isBenignWriteSink(value)) continue;
      return true;
    }
  }

  return false;
}

function isReadOnlyFsProbe(command: string): boolean {
  return /^(?:cat|head|tail|grep|egrep|fgrep|awk|sed\s+-n|wc|diff|cmp|stat|file|readlink|realpath|ls|find|tree|journalctl)(?:\s|$)/i.test(command)
    || /^git\s+diff(?:\s|$)/i.test(command);
}

function isLikelyFileWritingExec(command: string): boolean {
  return hasShellWriteRedirection(command)
    || hasTeeWrite(command)
    || /<<\s*\w+/.test(command)
    || /\bdd\b[\s\S]*\bof=[^\s]+/i.test(command)
    || /\btruncate\s+(?:-[^\s]+\s+)*[^\s|;&]+/i.test(command)
    || /\binstall\b[\s\S]*\s+[^\s|;&]+\s+[^\s|;&]+/i.test(command)
    || /\brsync\b[\s\S]*\s--delete\b/i.test(command)
    || /\btar\b[\s\S]*(?:\s-[^\s]*x|\s[^\s-]*x[^\s]*f?\b)[\s\S]*(?:\s-f\s*[^\s]+|\s-[^\s]*f[^\s]*\s+[^\s]+|\s[^\s]+\.tar(?:\.[a-z0-9]+)?\b)/i.test(command)
    || /\bunzip\b[\s\S]+/i.test(command)
    || /\bpatch\b[\s\S]*(?:<|\s-i\s|\s--input(?:=|\s))/i.test(command)
    || /\bperl\b[\s\S]*\s-[^\s]*i[^\s]*\b/i.test(command);
}

function isLikelyScriptOneLinerMutation(command: string): boolean {
  if (/\bpython(?:3)?\s+-c\s+["'][\s\S]*(?:open\s*\([\s\S]*["'][waax+][^"']*["']|write_text|write_bytes|shutil\.(?:rmtree|copy|copyfile|move)|os\.(?:remove|unlink|rename|rmdir|mkdir))/i.test(command)) {
    return true;
  }

  if (/\bnode\s+-e\s+["'][\s\S]*(?:writeFileSync|appendFileSync|rmSync|rmdirSync|unlinkSync|mkdirSync|renameSync|cpSync)/i.test(command)) {
    return true;
  }

  return false;
}

function isLikelyFindDeleteExec(command: string): boolean {
  return /\bfind\b/i.test(command) && /(^|\s)-delete(?=\s|$)/i.test(command);
}

function isLikelyFindExecRm(command: string): boolean {
  return /\bfind\b/i.test(command) && /(^|\s)-exec(?:dir)?\s+(?:\/bin\/)?rm\b/i.test(command);
}

function isLikelyXargsRm(command: string): boolean {
  return /\bxargs\b[\s\S]*\brm\b/i.test(command);
}


function isKnownDryRunInfrastructureCommand(command: string): boolean {
  return (/\bkubectl\b/i.test(command) && hasToolDryRunFlag(command, "kubectl"))
    || (/\bhelm\b/i.test(command) && hasToolDryRunFlag(command, "helm"));
}

function isLikelyInfrastructureMutation(command: string): boolean {
  if (/\bkubectl\s+(?:apply|delete|replace|patch|scale|cordon|uncordon|drain)\b/i.test(command) && !hasToolDryRunFlag(command, "kubectl")) return true;
  if (/\bkubectl\s+rollout\s+restart\b/i.test(command)) return true;
  if (/\bhelm\s+(?:install|upgrade|uninstall|delete|rollback)\b/i.test(command) && !hasToolDryRunFlag(command, "helm")) return true;
  return /\bterraform\s+(?:apply|destroy)\b/i.test(command)
    || /\bansible-playbook\b/i.test(command)
    || /\bdocker\s+(?:system|volume|image|container|builder)\s+prune\b/i.test(command)
    || /\bdocker\s+compose\s+rm\b/i.test(command);
}

function isLikelyRemoteScriptExec(command: string): boolean {
  return Boolean(getDangerousRemoteScriptLabel(command));
}

function isLikelyGitCleanMutation(command: string): boolean | undefined {
  if (!/\bgit\s+clean\b/i.test(command)) return undefined;

  const hasForce = hasShortFlag(command, "f") || hasLongFlag(command, "force");
  const dryRun = hasShortFlag(command, "n") || hasLongFlag(command, "dry-run");
  return hasForce && !dryRun;
}

function isDangerousCommandAtDepth(command: string, depth: number): CommandRiskResult {
  if (depth > 4) return { dangerous: false };

  for (const nestedPayload of getNestedShellPayloads(command)) {
    if (nestedPayload === command) continue;
    const nestedResult = isDangerousCommandAtDepth(nestedPayload, depth + 1);
    if (nestedResult.dangerous) return nestedResult;
  }

  const fullDangerousScriptLabel = getDangerousScriptOneLinerLabel(command);
  if (fullDangerousScriptLabel) return { dangerous: true, label: fullDangerousScriptLabel };

  const fullDangerousHereDocLabel = getDangerousScriptHereDocLabel(command);
  if (fullDangerousHereDocLabel) return { dangerous: true, label: fullDangerousHereDocLabel };

  const fullRemoteScriptLabel = getDangerousRemoteScriptLabel(command);
  if (fullRemoteScriptLabel) return { dangerous: true, label: fullRemoteScriptLabel };

  const fullInfrastructureLabel = getDangerousInfrastructureLabel(command);
  if (fullInfrastructureLabel) return { dangerous: true, label: fullInfrastructureLabel };

  for (const remotePayload of getSshRemotePayloads(command)) {
    const remoteResult = isDangerousCommandAtDepth(remotePayload, depth + 1);
    if (remoteResult.dangerous) return { dangerous: true, label: `ssh remote: ${remoteResult.label || "dangerous command"}` };
  }

  for (const segment of splitShellSegments(command)) {
    for (const nestedPayload of getNestedShellPayloads(segment)) {
      if (nestedPayload === segment) continue;
      const nestedResult = isDangerousCommandAtDepth(nestedPayload, depth + 1);
      if (nestedResult.dangerous) return nestedResult;
    }

    const dangerousRemoteScriptLabel = getDangerousRemoteScriptLabel(segment);
    if (dangerousRemoteScriptLabel) return { dangerous: true, label: dangerousRemoteScriptLabel };

    const dangerousInfrastructureLabel = getDangerousInfrastructureLabel(segment);
    if (dangerousInfrastructureLabel) return { dangerous: true, label: dangerousInfrastructureLabel };

    for (const remotePayload of getSshRemotePayloads(segment)) {
      const remoteResult = isDangerousCommandAtDepth(remotePayload, depth + 1);
      if (remoteResult.dangerous) return { dangerous: true, label: `ssh remote: ${remoteResult.label || "dangerous command"}` };
    }

    const dangerousRmLabel = getDangerousRmLabel(segment);
    if (dangerousRmLabel) return { dangerous: true, label: dangerousRmLabel };

    const dangerousFindDeleteLabel = getDangerousFindDeleteLabel(segment);
    if (dangerousFindDeleteLabel) return { dangerous: true, label: dangerousFindDeleteLabel };

    const dangerousFindExecRmLabel = getDangerousFindExecRmLabel(segment);
    if (dangerousFindExecRmLabel) return { dangerous: true, label: dangerousFindExecRmLabel };

    const dangerousXargsRmLabel = getDangerousXargsRmLabel(segment);
    if (dangerousXargsRmLabel) return { dangerous: true, label: dangerousXargsRmLabel };

    const dangerousScriptLabel = getDangerousScriptOneLinerLabel(segment);
    if (dangerousScriptLabel) return { dangerous: true, label: dangerousScriptLabel };

    const dangerousHereDocLabel = getDangerousScriptHereDocLabel(segment);
    if (dangerousHereDocLabel) return { dangerous: true, label: dangerousHereDocLabel };

    const dangerousGitCleanLabel = getDangerousGitCleanLabel(segment);
    if (dangerousGitCleanLabel) return { dangerous: true, label: dangerousGitCleanLabel };

    for (const { re, label } of DANGEROUS_PATTERNS) {
      if (re.test(segment)) {
        return { dangerous: true, label };
      }
    }
  }

  return { dangerous: false };
}

function isLikelyMutatingExecAtDepth(command: string, depth: number): boolean {
  if (depth > 4) return false;

  for (const nestedPayload of getNestedShellPayloads(command)) {
    if (nestedPayload !== command && isLikelyMutatingExecAtDepth(nestedPayload, depth + 1)) return true;
  }

  for (const remotePayload of getSshRemotePayloads(command)) {
    if (isLikelyMutatingExecAtDepth(remotePayload, depth + 1)) return true;
  }

  if (isLikelyScriptedFixExec(command)) return true;
  if (isLikelyRemoteScriptExec(command)) return true;
  if (isLikelyInfrastructureMutation(command)) return true;
  if (isLikelyFileWritingExec(command)) return true;
  if (isLikelyFindDeleteExec(command)) return true;
  if (isLikelyFindExecRm(command)) return true;
  if (isLikelyXargsRm(command)) return true;
  if (isLikelyScriptOneLinerMutation(command)) return true;

  const fullGitCleanMutation = isLikelyGitCleanMutation(command);
  if (typeof fullGitCleanMutation === "boolean") return fullGitCleanMutation;

  for (const segment of splitShellSegments(command)) {
    for (const nestedPayload of getNestedShellPayloads(segment)) {
      if (nestedPayload !== segment && isLikelyMutatingExecAtDepth(nestedPayload, depth + 1)) return true;
    }

    for (const remotePayload of getSshRemotePayloads(segment)) {
      if (isLikelyMutatingExecAtDepth(remotePayload, depth + 1)) return true;
    }

    if (isLikelyScriptedFixExec(segment)) return true;
    if (isLikelyRemoteScriptExec(segment)) return true;
    if (isLikelyInfrastructureMutation(segment)) return true;
    if (isLikelyFileWritingExec(segment)) return true;
    if (isLikelyFindDeleteExec(segment)) return true;
    if (isLikelyFindExecRm(segment)) return true;
    if (isLikelyXargsRm(segment)) return true;
    if (isLikelyScriptOneLinerMutation(segment)) return true;

    const gitCleanMutation = isLikelyGitCleanMutation(segment);
    if (typeof gitCleanMutation === "boolean") return gitCleanMutation;

    if (isReadOnlyFsProbe(segment)) continue;

    if (!isKnownDryRunInfrastructureCommand(segment) && MUTATING_EXEC_PATTERNS.some((pattern) => pattern.test(segment))) return true;
  }

  return false;
}

export function isDangerousCommand(command: string): CommandRiskResult {
  return isDangerousCommandAtDepth(command, 0);
}

export function isLikelyMutatingExec(command: string): boolean {
  return isLikelyMutatingExecAtDepth(command, 0);
}

export function isLikelyValidationExec(command: string): boolean {
  if (isLikelyMutatingExec(command)) return false;
  if (VALIDATION_EXEC_PATTERNS.some((pattern) => pattern.test(command))) return true;
  return /\b(curl|wget)\b/i.test(command) && VALIDATION_ENDPOINT_HINTS.test(command);
}

export function getExecCommand(input: Record<string, unknown>): string {
  return typeof input.command === "string"
    ? input.command
    : typeof input.cmd === "string"
      ? input.cmd
      : "";
}
