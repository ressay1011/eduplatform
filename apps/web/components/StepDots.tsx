/** Indicador de pasos del login (M3 progress — puntos). */
interface StepDotsProps {
  total: number;
  actual: number;
}

export function StepDots({ total, actual }: StepDotsProps) {
  return (
    <div
      className="step-indicator"
      role="progressbar"
      aria-valuenow={actual}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Paso ${actual} de ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const numero = i + 1;
        const estado = numero === actual ? ' active' : numero < actual ? ' done' : '';
        return <span key={numero} className={`step-dot${estado}`} aria-hidden="true" />;
      })}
    </div>
  );
}
