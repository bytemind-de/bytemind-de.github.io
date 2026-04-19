# NoCord-P2P 🎙

**Low-Bandwidth Peer-to-Peer Audio-Chat** — optimiert für Edge-Netzwerke und gedrosseltes Datenvolumen.

## Gesamtlast: < 50 kb/s

| Kanal       | Verbrauch          |
|-------------|-------------------|
| Audio       | ~24–30 kb/s (Opus) |
| Chat/Signal | < 1 kb/s           |
| Datei-Upload| 10–20 kb/s (dynm.) |

---

## Dateien

| Datei           | Beschreibung                            |
|-----------------|-----------------------------------------|
| `index.html`    | Gesamte App (Single-File, kein Build)   |
| `sw.js`         | Service Worker für PWA-Offline-Support  |
| `manifest.json` | PWA-Manifest für Browser-Installation  |

---

## Schnellstart

### Option A — Lokaler Webserver (empfohlen)
```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# Dann im Browser öffnen:
# http://localhost:8080
```

> **Wichtig:** Die App muss über HTTP(S) laufen (nicht `file://`), damit WebRTC, Mikrofon-Zugriff und Service Worker funktionieren.

### Option B — Nginx / Apache
Einfach die drei Dateien in den Web-Root kopieren. HTTPS wird für PWA-Features benötigt.

---

## Benutzung

### 1. Verbindung aufbauen
1. **Audio Input** → Mikrofon auswählen, Sampling Rate & Bitrate einstellen
2. **Verbindung** → Signaling Server wählen (Standard: PeerJS Cloud), auf **Verbinden** klicken
3. Deine **Peer-ID** erscheint — diese mit dem Gesprächspartner teilen (klicken zum Kopieren)
4. Peer-ID des anderen eingeben → **Anrufen**

### 2. Eigener Signaling Server
```bash
# PeerJS Server lokal starten
npx peerjs --port 9000

# Oder als npm package
npm install -g peer
peerjs --port 9000
```
Dann in der App "Eigener Server" wählen und `ws://localhost:9000/peerjs` eingeben.

---

## Technische Details

### Audio-Pipeline
- **Codec:** Opus (WebRTC-Standard, optimiert für Sprache)
- **SDP-Munging:** Bitrate wird via `maxaveragebitrate` im fmtp-Attribut gesetzt
- **FEC:** `useinbandfec=1` aktiviert Forward Error Correction für robuste Verbindungen
- **Mono:** `stereo=0` + `channelCount: 1` für halbierten Overhead

### Datei-Transfer (Smart Chunking)
- **Chunk-Größe:** 16 KB (SCTP-optimiert)
- **Backpressure:** `bufferedAmount`-Check vor jedem Chunk (Max 64 KB Buffer)
- **Bildkomprimierung:** Canvas API → WebP-Konvertierung, max. 1200px
- **Instant Preview:** Base64-Thumbnail (< 2 KB) wird sofort übertragen, Vollbild folgt
- **Priorität:** DataChannel mit `priority: "low"` — Audio hat immer Vorrang

### PWA / Offline
- Service Worker mit App-Shell-Caching (Cache-first für Assets, Network-first für Navigation)
- Bei Netzwerkunterbrechung bleibt die App-Logik intakt
- Installierbar über Browser ("Zur Startseite hinzufügen")

---

## Browser-Kompatibilität

| Browser        | Support |
|----------------|---------|
| Chrome 80+     | ✅ Voll |
| Firefox 78+    | ✅ Voll |
| Edge 80+       | ✅ Voll |
| Safari 15+     | ✅ Teilweise (kein SEPIA) |
| Mobile Chrome  | ✅ Voll |
| Mobile Safari  | ⚠️ Mikrofon eingeschränkt |

---

## Abhängigkeiten

- **PeerJS 1.5.5** — `https://github.com/peers/peerjs`
- **SEPIA Web Audio** — `https://github.com/SEPIA-Framework/sepia-web-audio`
- **Material Icons** - `https://github.com/marella/material-design-icons`

---

## Lizenz
MIT — use freely.
