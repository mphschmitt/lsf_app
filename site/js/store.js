// Stockage local (IndexedDB). Rien ne quitte l'appareil.

const NOM = "lsf-app";
const VERSION = 1;
const MAGASINS = ["cartes", "lecons", "reglages"];
let base = null;

function ouvrir() {
  if (base) return base;
  base = new Promise((ok, ko) => {
    const req = indexedDB.open(NOM, VERSION);
    req.onupgradeneeded = () => {
      for (const m of MAGASINS) {
        if (!req.result.objectStoreNames.contains(m)) req.result.createObjectStore(m, { keyPath: "id" });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
  return base;
}

async function tx(magasin, mode, fn) {
  const db = await ouvrir();
  return new Promise((ok, ko) => {
    const t = db.transaction(magasin, mode);
    const s = t.objectStore(magasin);
    const p = Promise.resolve(fn(s));
    t.oncomplete = () => p.then(ok, ko);
    t.onerror = () => ko(t.error);
  });
}

const req = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

export const lireTout = (m) => tx(m, "readonly", (s) => req(s.getAll()));
export const lire = (m, id) => tx(m, "readonly", (s) => req(s.get(id)));
export const ecrire = (m, objet) => tx(m, "readwrite", (s) => req(s.put(objet)));
export const ecrireTout = (m, objets) => tx(m, "readwrite", (s) => Promise.all(objets.map((o) => req(s.put(o)))));
export const vider = (m) => tx(m, "readwrite", (s) => req(s.clear()));

export async function reglage(cle, defaut = null) {
  const r = await lire("reglages", cle);
  return r ? r.valeur : defaut;
}
export const definirReglage = (cle, valeur) => ecrire("reglages", { id: cle, valeur });

export async function exporter() {
  const sortie = { app: "lsf-app", format: 1, date: new Date().toISOString() };
  for (const m of MAGASINS) sortie[m] = await lireTout(m);
  return sortie;
}

export async function importer(donnees) {
  if (!donnees || donnees.app !== "lsf-app") throw new Error("Ce fichier n'est pas une sauvegarde de l'app.");
  for (const m of MAGASINS) {
    if (!Array.isArray(donnees[m])) throw new Error("Sauvegarde incomplète.");
  }
  for (const m of MAGASINS) {
    await vider(m);
    await ecrireTout(m, donnees[m]);
  }
}

export async function toutEffacer() {
  for (const m of MAGASINS) await vider(m);
}

export async function demanderPersistance() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return navigator.storage ? await navigator.storage.persisted() : false;
  } catch {
    return false;
  }
}
