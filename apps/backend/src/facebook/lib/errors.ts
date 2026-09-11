import { HttpException } from "@nestjs/common";

export type FacebookErrorCode =
  | "INVALID_URL"
  | "SESSION_REQUIRED"
  | "SESSION_EXPIRED"
  | "POST_NOT_FOUND"
  | "POST_NOT_ACCESSIBLE"
  | "EXTRACTION_FAILED"
  | "BROWSER_ERROR"
  | "CONNECTION_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

/**
 * Igual que el FacebookError de apps/postscope, pero como HttpException de Nest.
 * El body es plano ({ code, message }, no { error: { code, message } }) a propósito:
 * Nest solo asigna bien `this.message` (usado en los catch internos del servicio,
 * ej. para guardar Source.lastError) cuando `response.message` es un string top-level.
 */
export class FacebookError extends HttpException {
  constructor(
    public readonly code: FacebookErrorCode,
    message: string,
    status = 500,
  ) {
    super({ code, message }, status);
  }
}
