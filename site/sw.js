// Service worker : l'app fonctionne hors ligne.
// - coquille de l'app : mise en cache à l'installation
// - contenu.json : réseau d'abord, cache en secours
// - vidéos et vignettes : cache d'abord (elles ne changent pas)
const VERSION = "v1";
const COQUILLE = `coquille-${VERSION}`;
const VIDEOS = "lsf-videos";

const FICHIERS = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/main.js", "js/ui.js", "js/etat.js", "js/store.js", "js/fsrs.js", "js/exercises.js",
  "js/exos.js", "js/session.js", "js/player.js",
  "fonts/atkinson-400.woff", "fonts/atkinson-700.woff", "fonts/bricolage-var.woff",
  "icons/icon-192.png", "icons/apple-touch-icon.png",
  "content/contenu.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(COQUILLE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k.startsWith("coquille-") && k !== COQUILLE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.includes("/content/videos/") || url.pathname.includes("/content/vignettes/")) {
    // Les requêtes partielles (Range) de Safari sont servies depuis le fichier complet en cache.
    e.respondWith(depuisCacheVideo(e.request));
    return;
  }
  if (url.pathname.endsWith("/content/contenu.json")) {
    e.respondWith(fetch(e.request).then((r) => {
      const copie = r.clone();
      caches.open(COQUILLE).then((c) => c.put(e.request, copie));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});

async function depuisCacheVideo(req) {
  const cache = await caches.open(VIDEOS);
  const url = req.url.split("#")[0];
  let reponse = await cache.match(url);
  if (!reponse) {
    try {
      const r = await fetch(url);
      if (r.ok) { await cache.put(url, r.clone()); reponse = r; } else return r;
    } catch {
      return new Response("", { status: 504 });
    }
  }
  const plage = req.headers.get("range");
  if (!plage) return reponse;
  const corps = await reponse.arrayBuffer();
  const m = /bytes=(\d+)-(\d*)/.exec(plage);
  const debut = Number(m[1]);
  const fin = m[2] ? Number(m[2]) : corps.byteLength - 1;
  return new Response(corps.slice(debut, fin + 1), {
    status: 206,
    headers: {
      "Content-Type": reponse.headers.get("Content-Type") || "video/mp4",
      "Content-Range": `bytes ${debut}-${fin}/${corps.byteLength}`,
      "Content-Length": String(fin - debut + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
