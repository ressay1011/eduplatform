/**
 * SessionTokenService — genera y hashea tokens de sesión opacos.
 *
 * El token en claro viaja SOLO al cliente (cookie httpOnly); la BD guarda
 * `sha256(token + pepper)`, y el pepper vive únicamente en el entorno de la
 * API (env.TOKEN_PEPPER). Un dump de la BD no permite reusar sesiones.
 */
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';

@Injectable()
export class SessionTokenService {
  /** Token nuevo: 48 bytes aleatorios en base64url (~64 caracteres). */
  generar(): string {
    return randomBytes(48).toString('base64url');
  }

  /** Lo que se persiste y busca en `sesiones.token_hash` (hex de sha256). */
  hash(token: string): string {
    return createHash('sha256')
      .update(token + env.TOKEN_PEPPER)
      .digest('hex');
  }
}
