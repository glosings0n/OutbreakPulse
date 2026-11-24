export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export interface AppError {
  code: string;
  message: string;
}

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = (code: string, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : "Unknown error";
}
