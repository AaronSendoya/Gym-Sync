// Design system compartido del panel de administración (ver reglas de estilo
// en .claude/CLAUDE.md — paleta zinc/sofisticada, sin negros planos, jerarquía
// tipográfica por peso+color, estados hover/focus/active obligatorios,
// botones con gradiente sutil, micro-píldoras con borde atenuado).
//
// Un solo origen de verdad: cualquier vista nueva debe importar de acá en vez
// de redefinir inputCls/btnPrimary/etc. localmente — así un ajuste al sistema
// se propaga a todas las pantallas de una vez.

// Superficie elevada estándar: capa translúcida + blur sobre bg-deep para dar
// profundidad sin box-shadow (deshabilitado globalmente en index.css). El borde
// es la ÚNICA señal de elevación disponible en dark mode — por eso va un poco
// más marcado (white/10, no white/[0.06]) que si pudiéramos apoyarnos en sombra.
export const cardCls =
  'bg-white dark:bg-bg-surface/70 dark:backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-xl';

// Variante para tarjetas clicables/navegables — el borde se ilumina y el fondo
// aclara ligeramente al hover, dando la sensación de "elevarse" sin sombra.
export const cardInteractiveCls =
  `${cardCls} transition-all duration-200 cursor-pointer hover:border-white/20 hover:bg-slate-50 dark:hover:bg-bg-surface`;

export const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-bg-deep/60 px-3 py-2 text-sm text-slate-900 dark:text-gray-100 outline-none transition-all duration-200 hover:border-slate-400 dark:hover:border-white/20 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 placeholder:text-slate-400 dark:placeholder:text-gray-600';

export const labelCls = 'block text-sm font-semibold text-slate-700 dark:text-gray-400 mt-4 mb-1.5';

export const btnPrimary =
  'px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-b from-[#FF7A29] to-brand-orange ring-1 ring-white/10 cursor-pointer border-0 transition-all duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100';

export const btnGhost =
  'px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 cursor-pointer border border-transparent dark:border-white/5 transition-all duration-200';

export const btnDanger =
  'px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

export const rowHoverCls = 'transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-white/[0.04]';

export const iconBtnCls = 'p-2 rounded-lg cursor-pointer bg-transparent border-0 transition-all duration-200';

// ── Tabla — densidad estándar compartida ────────────────────────────────────
// Fila más alta (py-4 en vez de py-3.5) y texto secundario nunca por debajo de
// text-xs (antes se veían micro-etiquetas a 10-11px) para que las columnas
// "respiren" en vez de perderse en espacio muerto cuando el panel es más ancho
// que el contenido de la tabla. Usar junto con anchos de columna explícitos
// (<col> o className w-[...] por <th>) — sin eso el navegador reparte el
// espacio sobrante de forma pareja entre columnas cortas y largas por igual.
export const theadCls =
  'bg-slate-50 dark:bg-white/[0.04] border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wider';

export const thCls = 'px-5 py-3.5';

export const tdCls = 'px-5 py-4 text-sm';

export const tdMutedCls = 'px-5 py-4 text-sm text-slate-500 dark:text-gray-500';

export const trCls =
  `border-b border-slate-100 dark:border-white/[0.06] text-slate-700 dark:text-gray-300 ${rowHoverCls}`;

// ── Empty state ──────────────────────────────────────────────────────────────
export const emptyIconWrapCls =
  'w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-400 dark:text-gray-500 mb-4';

// Paleta semántica compartida para píldoras de estado (activo/inactivo, etc.)
// — borde atenuado, nunca relleno sólido chillón.
export const PILL_TONE = {
  green:  'bg-green-500/10 text-green-400 border border-green-500/25',
  gray:   'bg-gray-500/10 text-gray-400 border border-gray-500/25',
  sky:    'bg-sky-500/10 text-sky-400 border border-sky-500/25',
  red:    'bg-red-500/10 text-red-400 border border-red-500/25',
  amber:  'bg-amber-500/10 text-amber-400 border border-amber-500/25',
  purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/25',
} as const;

export const pillCls = (tone: keyof typeof PILL_TONE) =>
  `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${PILL_TONE[tone]}`;
