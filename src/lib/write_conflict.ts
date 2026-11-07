export interface write_conflict {
  conflict: boolean;
  message: string;
}

const BUSY_CODES = new Set(["40900", "SESSION_BUSY", "CONFLICT", "409"]);

export function detect_write_conflict(status: number, payload: unknown): write_conflict {
  if (status === 409) {
    return { conflict: true, message: "该会话正在其他设备上运行" };
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : "";
    if (BUSY_CODES.has(code)) {
      const info = typeof record.info === "string" ? record.info : "";
      return { conflict: true, message: info || "该会话正在其他设备上运行" };
    }
  }

  return { conflict: false, message: "" };
}

export function conflict_notice(conflict: write_conflict): string | null {
  if (!conflict.conflict) return null;
  return `${conflict.message}，当前已切换为只读；恢复写入需在本机重新连接。`;
}