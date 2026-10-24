/**
 * Fábrica de errores HTTP con el contrato ApiResponse (AGENTS.md §3.1).
 * Uso: `throw apiError(ErrorCodes.NOT_FOUND, 404, '...')`.
 */
import { HttpException } from '@nestjs/common';
import type { ApiResponse, ErrorCode } from '@eduplatform/types';

export function apiError(
  code: ErrorCode,
  status: number,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  const body: ApiResponse<never> = {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
  return new HttpException(body, status);
}
