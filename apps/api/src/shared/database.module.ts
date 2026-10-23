/**
 * DatabaseModule — provee la instancia de Drizzle (token DATABASE) a toda la API.
 * Es GLOBAL: cualquier módulo la inyecta con `@Inject(DATABASE)` sin re-importar.
 *
 * El runtime SIEMPRE conecta con el rol `app_user` (sujeto a RLS — ADR-002).
 * Las migraciones usan `app_migrator` desde packages/database, nunca la API.
 *
 * S8 del informe: si por error la URL apunta al rol dueño (`app_migrator`), la
 * RLS queda INERTE en silencio. Aquí se verifica el rol al arrancar y se aborta
 * el proceso (salvo en tests, que crean el esquema con el rol de migración).
 *
 * R3: el pool se cierra ordenadamente al apagar (`onModuleDestroy`), para que
 * cada deploy libere sus conexiones en vez de dejarlas colgadas.
 */
import { Global, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ROL_RUNTIME, crearCliente } from '@eduplatform/database';
import { env } from '../config/env';

/** Token de inyección de la base de datos. */
export const DATABASE = Symbol('DATABASE');

/** Fallback SOLO para desarrollo local sin .env (en producción la var es obligatoria). */
const DEV_FALLBACK_URL = 'postgresql://app_user:***@localhost:5432/eduplatform';

type Cliente = ReturnType<typeof crearCliente>['client'];
const clientes: Cliente[] = [];

/**
 * Aborta si la conexión no es del rol de runtime: con el rol dueño las
 * políticas de RLS no aplican y el aislamiento entre colegios desaparece.
 */
async function verificarRolRuntime(client: Cliente): Promise<void> {
  const filas = await client<{ usuario: string }[]>`SELECT current_user AS usuario`;
  const usuario = filas[0]?.usuario ?? '';
  if (usuario === ROL_RUNTIME) return;
  if (env.NODE_ENV === 'test') {
    new Logger('DatabaseModule').warn(
      `Runtime conectado como "${usuario}" en tests (se permite para preparar el esquema).`,
    );
    return;
  }
  throw new Error(
    `La API debe conectar como "${ROL_RUNTIME}" para que la RLS filtre datos, pero conectó como "${usuario}". Revisa DATABASE_URL.`,
  );
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: async () => {
        const par = crearCliente(env.DATABASE_URL ?? DEV_FALLBACK_URL);
        await verificarRolRuntime(par.client);
        clientes.push(par.client);
        return par.db;
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  async onModuleDestroy(): Promise<void> {
    const abiertos = clientes.splice(0, clientes.length);
    await Promise.all(
      abiertos.map(async (client) => {
        try {
          await client.end({ timeout: 5 });
        } catch (err) {
          this.logger.warn(
            `No se pudo cerrar el pool limpiamente: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
  }
}