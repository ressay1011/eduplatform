/**
 * Layout raíz — fuentes del design system (Fraunces display + Inter body +
 * JetBrains Mono) y estilos globales (tokens M3). Material Symbols vía CDN
 * (igual que el diseño aprobado).
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-fraunces' });
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

/**
 * Pinta el branding guardado antes del primer frame: sin esto, cada recarga
 * enseña el color por defecto hasta que hidrata `BrandingProvider`. Es una
 * copia mínima de `lib/branding.ts` (aplicarPaleta) porque en el `<head>` no
 * se puede importar código de la app.
 */
const SCRIPT_MARCA =
  "(function(){try{var g=localStorage.getItem('eduplatform.branding');if(!g)return;" +
  'var p=JSON.parse(g).paleta;if(!p)return;' +
  "var r=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?p.oscuro:p.claro;" +
  'if(!r)return;var e=document.documentElement.style;for(var k in r){var v=r[k];' +
  "if(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)){" +
  "e.setProperty('--md-sys-color-'+k.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase()}),v);}}" +
  'if(r.primary)e.setProperty("--aurora-1",r.primary);}catch(x){}})();';

export const metadata: Metadata = {
  title: 'EduPlatform — Iniciar sesión',
  description: 'Plataforma de gestión escolar para colegios públicos de Colombia.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,GRAD,FILL@24,400,0,0"
        />
        {/* Antes del body: el color del colegio no debe aparecer después del primer frame. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_MARCA }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
