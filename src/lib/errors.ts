export class AppError extends Error {
  constructor(
    public code: "validation" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "rate_limited" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

// O Drizzle encapsula o erro do driver em `cause`.
export function isDuplicateKey(e: unknown): boolean {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code === "ER_DUP_ENTRY" || x?.cause?.code === "ER_DUP_ENTRY";
}
