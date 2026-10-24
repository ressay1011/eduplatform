/**
 * PasswordService — hashing y verificación de contraseñas con bcrypt.
 * Round 12 (AGENTS.md §1.5 exige >= 10). Las contraseñas NUNCA se loguean.
 */
import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from './auth.constants';

@Injectable()
export class PasswordService {
  /** Hash bcrypt de una contraseña en claro. */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /** Compara la contraseña en claro contra el hash almacenado. */
  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
