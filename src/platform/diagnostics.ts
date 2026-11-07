import { capability_table } from "./capabilities";
import { ARTIFACT_VERSION, BRIDGE_VERSION } from "./version";

export interface diagnostic_error {
  code: string;
  message: string;
  trace_id?: string;
}

export interface diagnostic_report {
  generated_at: string;
  host: string;
  shell_version: string;
  artifact_hash: string;
  bridge_version: number;
  capabilities: Record<string, string>;
  errors: diagnostic_error[];
}

const redact_patterns: Array<{ re: RegExp; replacement: string }> = [
  { re: /Bearer\s+[A-Za-z0-9._-]+/g, replacement: "Bearer ***" },
  { re: /sk-[A-Za-z0-9._-]{6,}/g, replacement: "sk-***" },
  { re: /(password|secret|token)\s*[=:]\s*[^\s,;]+/gi, replacement: "$1=***" },
  { re: /X-API-Key:\s*[^\s,;]+/gi, replacement: "X-API-Key: ***" },
];

export function redact(text: string): string {
  let result = text;
  for (const pattern of redact_patterns) {
    result = result.replace(pattern.re, pattern.replacement);
  }
  return result;
}

function redact_error(error: diagnostic_error): diagnostic_error {
  return { ...error, message: redact(error.message) };
}

export async function collect_diagnostics(options: {
  shell_version?: string;
  artifact_hash?: string;
  errors?: diagnostic_error[];
} = {}): Promise<diagnostic_report> {
  const table = await capability_table();
  const capabilities = Object.fromEntries(
    Object.entries(table.entries).map(([domain, entry]) => [domain, entry.state]),
  );

  return {
    generated_at: new Date().toISOString(),
    host: table.host,
    shell_version: options.shell_version ?? ARTIFACT_VERSION,
    artifact_hash: options.artifact_hash ?? "",
    bridge_version: BRIDGE_VERSION,
    capabilities,
    errors: (options.errors ?? []).map(redact_error),
  };
}