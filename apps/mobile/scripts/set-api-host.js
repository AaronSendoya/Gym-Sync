/**
 * Detecta la IP local de la maquina y sobreescribe apps/mobile/.env
 * con EXPO_PUBLIC_API_BASE_URL apuntando al backend (puerto 3000).
 *
 * Se ejecuta automaticamente como hook "pre" antes de expo start/android/ios.
 * De esta forma no hay que editar el .env manualmente al cambiar de red WiFi.
 */
const os   = require('os');
const fs   = require('fs');
const path = require('path');

function detectLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const iface of (addrs ?? [])) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }

  // Prioridad: adaptador WiFi (Windows: "Wi-Fi", Linux/Mac: "wlan0", "en0")
  const wifi = candidates.find(c => /wi.?fi|wlan|en0|wireless/i.test(c.name));
  if (wifi) return wifi.address;

  // Fallback: primer IPv4 no-interno disponible (Ethernet, etc.)
  return candidates[0]?.address ?? null;
}

const ip = detectLocalIP();

if (!ip) {
  console.warn('[gymsync] No se detectó IP local. El .env no fue modificado.');
  process.exit(0);
}

const envPath = path.join(__dirname, '..', '.env');
const content =
  `# Auto-generado por scripts/set-api-host.js — no editar manualmente\n` +
  `# Para forzar una IP fija crea .env.local (no se sobreescribe)\n` +
  `EXPO_PUBLIC_API_BASE_URL=http://${ip}:3000\n` +
  `EXPO_PUBLIC_API_TIMEOUT_MS=10000\n`;

fs.writeFileSync(envPath, content, 'utf8');
console.log(`[gymsync] API host → http://${ip}:3000`);
