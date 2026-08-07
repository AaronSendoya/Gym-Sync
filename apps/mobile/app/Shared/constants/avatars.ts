// Catálogo de avatares — íconos vectoriales (MaterialCommunityIcons) en vez de
// PNGs generados por IA. Los PNGs anteriores pesaban ~17MB en total (uno solo
// llegaba a 7.8MB) solo para el selector de avatar; los íconos vectoriales ya
// vienen empaquetados con @expo/vector-icons, así que no agregan peso extra.
//
// Los `icon` son intencionalmente los mismos nombres que ya se guardaban en
// `profile.avatarUrl` con los PNGs anteriores (coincidían 1:1 con nombres de
// MaterialCommunityIcons) — así los avatares elegidos antes del cambio se
// siguen viendo correctamente sin necesidad de migrar datos.
export type AvatarOption = {
  id: string;
  icon: string;
  color: string;
};

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: '1', icon: 'face-man-profile',   color: '#38BDF8' },
  { id: '2', icon: 'face-woman-profile', color: '#f472b6' },
  { id: '3', icon: 'robot-outline',      color: '#a78bfa' },
  { id: '4', icon: 'incognito',          color: '#94a3b8' },
  { id: '5', icon: 'alien-outline',      color: '#34d399' },
  { id: '6', icon: 'cat',                color: '#fbbf24' },
  { id: '7', icon: 'fire',               color: '#f97316' },
  { id: '8', icon: 'crown',              color: '#facc15' },
  { id: '9', icon: 'star',               color: '#f05b22' },
];

export const DEFAULT_AVATAR_ICON = 'face-man-profile';

export const getAvatarColor = (icon: string | null | undefined): string =>
  AVATAR_OPTIONS.find(av => av.icon === icon)?.color ?? '#f05b22';
