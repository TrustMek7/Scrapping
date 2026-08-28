export type FacebookErrorCode =
  | "INVALID_URL"
  | "SESSION_REQUIRED"
  | "SESSION_EXPIRED"
  | "POST_NOT_FOUND"
  | "POST_NOT_ACCESSIBLE"
  | "EXTRACTION_FAILED"
  | "BROWSER_ERROR"
  | "UNKNOWN_ERROR";

export class FacebookError extends Error {
  constructor(
    public readonly code: FacebookErrorCode,
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "FacebookError";
  }
}

export function facebookErrorResponse(error: unknown) {
  if (error instanceof FacebookError) {
    console.error(`[Facebook] ${error.code}: ${error.message}`);
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error("[Facebook] UNKNOWN_ERROR", error);
  return Response.json(
    {
      error: {
        code: "UNKNOWN_ERROR" satisfies FacebookErrorCode,
        message: "Ocurrió un error inesperado.",
      },
    },
    { status: 500 },
  );
}
