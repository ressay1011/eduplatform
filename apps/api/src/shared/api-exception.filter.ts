/**
 * ApiExceptionFilter — TODA respuesta de error sigue el contrato ApiResponse,
 * incluidas las que genera Nest automáticamente (404 de ruta inexistente,
 * excepciones inesperadas → 500 INTERNAL_ERROR sin filtrar detalles internos).
 */
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCodes, type ApiResponse, type ErrorCode } from '@eduplatform/types';

const CODE_POR_STATUS: Record<number, ErrorCode> = {
  400: ErrorCodes.VALIDATION_ERROR,
  401: ErrorCodes.UNAUTHORIZED,
  403: ErrorCodes.FORBIDDEN,
  404: ErrorCodes.NOT_FOUND,
  409: ErrorCodes.CONFLICT,
  423: ErrorCodes.ACCOUNT_LOCKED,
  429: ErrorCodes.RATE_LIMITED,
};

/** Extrae un mensaje legible del cuerpo de una HttpException (sin `as`). */
function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.length > 0) return body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const m: unknown = body.message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m) && m.every((x) => typeof x === 'string')) return m.join(', ');
  }
  return fallback;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // ZodError de los .parse() de los controllers → 400 con el detalle de issues.
    const issuesZod = issuesDeZodError(exception);
    if (issuesZod !== null) {
      const wrapped: ApiResponse<never> = {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Datos inválidos en la solicitud',
          details: { issues: issuesZod },
        },
      };
      response.status(HttpStatus.BAD_REQUEST).json(wrapped);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Si ya viene con el contrato (lanzada con apiError), se usa tal cual.
      if (typeof body === 'object' && body !== null && 'success' in body) {
        response.status(status).json(body);
        return;
      }
      // Excepciones automáticas de Nest → envolver en el contrato.
      const wrapped: ApiResponse<never> = {
        success: false,
        error: {
          code: CODE_POR_STATUS[status] ?? ErrorCodes.INTERNAL_ERROR,
          message: extractMessage(body, exception.message),
        },
      };
      response.status(status).json(wrapped);
      return;
    }

    // Error inesperado: se loguea completo, al cliente solo el contrato genérico.
    this.logger.error(
      `Error no controlado en ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    const wrapped: ApiResponse<never> = {
      success: false,
      error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Error interno del servidor' },
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(wrapped);
  }
}

/**
 * Detecta un ZodError por NOMBRE, no por `instanceof`: al mezclar ESM (vitest)
 * con paquetes CJS (dist del workspace) zod puede cargarse en DOS copias de
 * módulo y `instanceof` falla entre ellas. Devuelve los issues normalizados.
 */
function issuesDeZodError(
  exception: unknown,
): Array<{ path: string; message: string }> | null {
  if (!(exception instanceof Error) || exception.name !== 'ZodError') return null;
  const issues: unknown = Reflect.get(exception, 'issues');
  if (!Array.isArray(issues)) return null;
  return issues.map((issue) => {
    if (typeof issue !== 'object' || issue === null) {
      return { path: '', message: 'inválido' };
    }
    const path: unknown = Reflect.get(issue, 'path');
    const message: unknown = Reflect.get(issue, 'message');
    return {
      path: Array.isArray(path) ? path.map(String).join('.') : '',
      message: typeof message === 'string' ? message : 'inválido',
    };
  });
}