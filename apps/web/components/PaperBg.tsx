/**
 * Fondo "papel" — firma visual del diseño aprobado: 8 curvas orgánicas +
 * grilla que se dibujan al cargar (CSS en globals.css, con soporte de
 * prefers-reduced-motion).
 */
export function PaperBg() {
  return (
    <div className="paper-bg" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth={0.3} className="paper-grid" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" className="paper-grid" style={{ opacity: 0.3 }} />
        <path className="paper-curve-1" d="M-50,180 C200,120 350,260 580,200 S900,150 1100,220 1380,180 1500,260" />
        <path className="paper-curve-2" d="M-50,340 C220,280 380,400 600,360 S920,300 1120,380 1400,340 1500,420" />
        <path className="paper-curve-3" d="M-50,520 C240,460 400,580 620,540 S940,480 1140,560 1420,520 1500,600" />
        <path className="paper-curve-4" d="M-50,720 C260,660 420,780 640,740 S960,680 1160,760 1440,720 1500,800" />
        <path className="paper-curve-5" d="M-50,100 C200,60 380,180 620,140 S940,80 1140,160 1420,100 1500,180" transform="translate(0,180) scale(-1,1) translate(-1500,0)" />
        <path className="paper-curve-6" d="M-50,260 C240,200 400,320 620,280 S940,220 1140,300 1420,260 1500,340" transform="translate(0,180) scale(-1,1) translate(-1500,0)" />
        <path className="paper-curve-7" d="M-50,460 C220,400 380,520 600,480 S920,420 1120,500 1400,460 1500,540" transform="translate(0,180) scale(-1,1) translate(-1500,0)" />
        <path className="paper-curve-8" d="M-50,660 C260,600 420,720 640,680 S960,620 1160,700 1440,660 1500,740" transform="translate(0,180) scale(-1,1) translate(-1500,0)" />
      </svg>
    </div>
  );
}