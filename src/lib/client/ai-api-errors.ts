export interface SafeAIAPIError {
  error?: string;
  message?: string;
  code?: string;
}

/** Extract only public error fields; never forward the raw response body to logs. */
export function parseAIAPIError(body: string): SafeAIAPIError {
  if (!body.trim()) return {};

  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const record = parsed as Record<string, unknown>;
    return {
      ...(typeof record.error === 'string' ? { error: record.error } : {}),
      ...(typeof record.message === 'string' ? { message: record.message } : {}),
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
    };
  } catch {
    return {};
  }
}
