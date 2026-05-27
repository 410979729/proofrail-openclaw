import { looksLikePlainTextFailure, parseResultObject } from "./text";

function getFirstNumericField(result: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = result[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function getToolResultStatus(result: unknown, errorText = ""): "success" | "failure" | "unknown" {
  if (typeof errorText === "string" && errorText.trim()) return "failure";

  const payload = parseResultObject(result);
  if (!payload) {
    if (typeof result === "string" && looksLikePlainTextFailure(result)) return "failure";
    return "unknown";
  }

  const exitCode = getFirstNumericField(payload, ["exitCode", "exit_code", "code", "returnCode", "returncode", "status"]);
  const httpStatus = getFirstNumericField(payload, ["statusCode", "httpStatus", "http_status"]);

  if (typeof payload.signal === "string" && payload.signal.trim()) return "failure";
  if (typeof exitCode === "number" && exitCode !== 0) return "failure";
  if (typeof httpStatus === "number" && httpStatus >= 400) return "failure";
  if (typeof payload.success === "boolean" && !payload.success) return "failure";
  if (typeof payload.ok === "boolean" && !payload.ok) return "failure";
  if (typeof payload.error === "string" && payload.error.trim()) return "failure";
  if (payload.errors) return "failure";

  if (typeof exitCode === "number") return "success";
  if (typeof payload.success === "boolean" && payload.success) return "success";
  if (typeof payload.ok === "boolean" && payload.ok) return "success";
  if (typeof httpStatus === "number" && httpStatus >= 200 && httpStatus < 400) return "success";

  return "unknown";
}
