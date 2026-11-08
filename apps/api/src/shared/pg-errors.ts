/**
 * Lectura de los SQLSTATE de Postgres — una sola copia.
 *
 * Drizzle envuelve el fallo de una query en `DrizzleQueryError` y deja el error
 * real en `cause` (`drizzle-orm/errors.js`), así que el código puede venir en
 * cualquiera de los dos niveles. Antes cada módulo lo leía a su manera y uno de
 * ellos (usuarios) solo miraba el nivel superior: en la carrera de dos altas
 * simultáneas respondía 500 en vez de 409.
 */

/** Código SQLSTATE del error o de su `cause`; undefined si no es un error de Postgres. */
export function codigoPg(error: unknown): string | undefined {
  const leer = (posible: unknown): string | undefined => {
    if (typeof posible !== 'object' || posible === null) return undefined;
    const codigo = Reflect.get(posible, 'code');
    return typeof codigo === 'string' ? codigo : undefined;
  };
  const causa =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'cause') : undefined;
  return leer(error) ?? leer(causa);
}

/** 23505 = unique_violation. */
export function esViolacionUnica(error: unknown): boolean {
  return codigoPg(error) === '23505';
}
