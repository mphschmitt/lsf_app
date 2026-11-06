// Petits outils d'interface : création d'éléments, icônes, navigation.

export function h(tag, props = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  ajouter(el, enfants);
  return el;
}

function ajouter(el, enfants) {
  for (const e of enfants.flat(Infinity)) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
}

const SVG = "http://www.w3.org/2000/svg";
const CHEMINS = {
  carte: "M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z M9 4v14 M15 6v14",
  cible: "M12 4a8 8 0 1 0 0.01 0z M12 8a4 4 0 1 0 0.01 0z",
  livre: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11",
  profil: "M12 4a4 4 0 1 0 0.01 0z M4 21a8 8 0 0 1 16 0",
  flamme: "M12 3c1 3 5 4.5 5 9a5 5 0 0 1-10 0c0-2 .8-3.4 2-4.5.3 1.6 1.2 2.5 2 2.5 0-3 0-5 1-7z",
  eclair: "M13 2 4 14h7l-1 8 9-12h-7z",
  check: "M5 12.5 10 17l9-10",
  croix: "M6 6l12 12M18 6 6 18",
  cadenas: "M5 11h14v9H5z M8 11V8a4 4 0 0 1 8 0v3",
  lecture: "M8 5v14l11-7z",
  revoir: "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5",
  externe: "M14 4h6v6 M20 4 11 13 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  retour: "M15 5 8 12l7 7",
  main: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11 M14 10.5V6a1.5 1.5 0 0 1 3 0v6 M17 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7l-2.6-4a1.5 1.5 0 0 1 2.4-1.8L8 14",
  bouclier: "M12 3 4 7v5c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V7z",
  telecharger: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  partager: "M12 3v12 M7 8l5-5 5 5 M5 13v7h14v-7",
  plus: "M12 5v14 M5 12h14",
  camera: "M4 7h4l2-2h4l2 2h4v12H4z M12 10a3.5 3.5 0 1 0 .01 0z",
  video: "M3 5h18v14H3z M10 9l5 3-5 3z",
};

export function icone(nom, taille = 24, props = {}) {
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("width", taille);
  s.setAttribute("height", taille);
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", props.epaisseur || 2);
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  if (props.label) { s.setAttribute("role", "img"); s.setAttribute("aria-label", props.label); }
  else s.setAttribute("aria-hidden", "true");
  for (const d of CHEMINS[nom].split(" M").map((p, i) => (i ? "M" + p : p))) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    s.append(p);
  }
  return s;
}

export function aller(chemin) {
  location.hash = "#" + chemin;
}

export function lienExterne(href, ...enfants) {
  return h("a", { href, target: "_blank", rel: "noopener noreferrer" }, ...enfants);
}

export function toast(texte) {
  const t = h("div", { class: "toast", role: "status" }, texte);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

export function barreOnglets(actif) {
  const onglet = (cle, chemin, nom, ic) => h("a", {
    href: "#" + chemin, class: "onglet" + (actif === cle ? " actif" : ""),
    "aria-current": actif === cle ? "page" : null,
  }, icone(ic), h("span", {}, nom));
  return h("nav", { class: "onglets", "aria-label": "Navigation principale" },
    onglet("parcours", "/", "Parcours", "carte"),
    onglet("entrainement", "/entrainement", "Entraînement", "cible"),
    onglet("dico", "/dico", "Dictionnaire", "livre"),
    onglet("profil", "/profil", "Profil", "profil"));
}

export function estIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function estInstallee() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}
