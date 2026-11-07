import { h, icone, lienExterne } from "./ui.js";

export function ressourcesVideo(sens, horsLigne = typeof navigator !== "undefined" && !navigator.onLine) {
  const ressources = [...sens.ressources, ...(sens.videosEnLigne || [])];
  if (!horsLigne) return ressources;
  const locales = ressources.filter((r) => !r.distante);
  return locales.length ? [...locales, ...ressources.filter((r) => r.distante)] : ressources;
}

export function ressourceVideoAttitree(sens) {
  const ressources = [...sens.ressources, ...(sens.videosEnLigne || [])];
  return ressources.find((r) => !r.distante) || ressources[0];
}

export function initialiserRessourcesLecteur(sens, { stable = false, horsLigne = typeof navigator !== "undefined" && !navigator.onLine } = {}) {
  const ressources = ressourcesVideo(sens, horsLigne);
  const choixInitiaux = horsLigne && ressources.some((r) => !r.distante)
    ? ressources.map((r, n) => !r.distante ? n : -1).filter((n) => n >= 0)
    : ressources.map((_, n) => n);
  const indexInitial = stable
    ? ressources.indexOf(ressourceVideoAttitree(sens))
    : choixInitiaux[Math.floor(Math.random() * choixInitiaux.length)];
  return { ressources, indexInitial };
}

// Lecteur d'un signe : boucle, ralenti, revoir, navigation entre vidéos, crédit.
export function lecteur(sens, { controles = true, credit = true, index = null, onIndexChange = () => {}, stable = false } = {}) {
  const { ressources: res, indexInitial } = initialiserRessourcesLecteur(sens, { stable });
  let i = stable ? indexInitial : (index ?? indexInitial);
  let lent = false;

  const video = h("video", {
    class: "video", muted: true, playsInline: true, loop: true, autoplay: true,
    preload: "auto", "aria-label": "Vidéo du signe",
  });
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  const cadre = h("div", { class: "cadre-video" }, video);
  const erreurLecture = h("p", { class: "erreur-video", role: "status", hidden: true });
  const ligneCredit = h("p", { class: "credit" });

  function masquerErreur() {
    erreurLecture.hidden = true;
    erreurLecture.replaceChildren();
  }
  function afficherErreur() {
    const r = res[i];
    erreurLecture.replaceChildren(
      r.distante
        ? "Impossible de charger cette vidéo Elix. Vérifie ta connexion ou ouvre-la sur Elix. "
        : "Impossible de charger cette vidéo. Réessaie ou choisis une autre ressource. ",
      r.distante ? lienExterne(r.origine, "Ouvrir Elix") : null,
      h("button", { type: "button", class: "btn-mini", onclick: charger }, "Réessayer"),
      r.distante && res.some((ressource) => !ressource.distante)
        ? h("button", { type: "button", class: "btn-mini", onclick: () => selectionner(res.findIndex((ressource) => !ressource.distante)) },
          "Afficher une vidéo locale")
        : null,
    );
    erreurLecture.hidden = false;
  }
  function charger() {
    const r = res[i];
    masquerErreur();
    video.pause();
    video.dataset.url = r.video;
    video.poster = r.vignette || "";
    video.src = r.video;
    video.playbackRate = lent ? 0.5 : 1;
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
    ligneCredit.replaceChildren(
      res.length > 1 ? `Vidéo ${i + 1} sur ${res.length} · ` : "",
      lienExterne(r.origine, r.auteur),
      r.distante ? " · lecture en ligne sur Elix" : ` · ${r.licence}`,
    );
  }
  function selectionner(nouvelIndex) {
    i = nouvelIndex;
    charger();
    onIndexChange(i);
  }
  function changer(delta) {
    selectionner((i + delta + res.length) % res.length);
  }
  video.addEventListener("error", () => {
    if (video.dataset.url === res[i].video) afficherErreur();
  });
  video.addEventListener("loadeddata", masquerErreur);
  video.addEventListener("loadedmetadata", () => { video.playbackRate = lent ? 0.5 : 1; });

  if (res.length > 1) {
    let depart = null;
    const balayer = (x, y) => {
      if (!depart) return;
      const dx = x - depart.x;
      const dy = y - depart.y;
      depart = null;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25) changer(dx < 0 ? 1 : -1);
    };
    cadre.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      if (t) depart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    cadre.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      if (t) balayer(t.clientX, t.clientY);
    }, { passive: true });
    cadre.addEventListener("touchcancel", () => { depart = null; }, { passive: true });
    cadre.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || e.pointerType === "touch") return;
      depart = { x: e.clientX, y: e.clientY, id: e.pointerId };
      cadre.setPointerCapture(e.pointerId);
    });
    cadre.addEventListener("pointerup", (e) => {
      if (!depart || depart.id !== e.pointerId) return;
      balayer(e.clientX, e.clientY);
    });
    cadre.addEventListener("pointercancel", () => { depart = null; });
  }

  const btnLent = h("button", { type: "button", class: "btn-mini", "aria-pressed": "false",
    onclick: () => {
      lent = !lent;
      video.playbackRate = lent ? 0.5 : 1;
      btnLent.setAttribute("aria-pressed", String(lent));
      btnLent.classList.toggle("actif", lent);
    } }, "Ralenti 0,5×");
  const navigation = res.length > 1 ? h("div", { class: "navigation-videos", role: "group", "aria-label": "Parcourir les vidéos du mot" },
    h("button", { type: "button", class: "btn-mini", "aria-label": "Vidéo précédente", onclick: () => changer(-1) }, "Précédente"),
    h("button", { type: "button", class: "btn-mini", "aria-label": "Vidéo suivante", onclick: () => changer(1) }, "Suivante"),
    h("span", { class: "info indication-balaye" }, "Fais glisser la vidéo pour changer")) : null;
  const barre = controles ? h("div", { class: "controles" },
    navigation,
    h("button", { type: "button", class: "btn-mini", onclick: () => { video.currentTime = 0; video.play().catch(() => {}); } },
      icone("revoir", 18), "Revoir"),
    btnLent,
  ) : null;

  charger();
  return h("div", { class: "lecteur" }, cadre, erreurLecture, barre, credit ? ligneCredit : null);
}

// Petite vidéo muette pour les choix (QCM mot → vidéo, paires).
export function miniVideo(sens, { stable = false } = {}) {
  const toutesLesRessources = ressourcesVideo(sens);
  const ressources = stable ? [ressourceVideoAttitree(sens)] : toutesLesRessources;
  const locales = ressources.filter((r) => !r.distante);
  const choix = !navigator.onLine && locales.length ? locales : ressources;
  let ressource = choix[Math.floor(Math.random() * choix.length)];
  let repliEffectue = false;
  const v = h("video", { class: "mini-video", muted: true, playsInline: true, loop: true, autoplay: true, preload: "auto", poster: ressource.vignette || "", src: ressource.video });
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  const erreur = h("span", { class: "erreur-mini-video", role: "status", hidden: true });
  v.addEventListener("error", () => {
    if (ressource.distante && locales.length && !repliEffectue) {
      repliEffectue = true;
      ressource = locales[0];
      erreur.textContent = "Vidéo Elix indisponible ; une vidéo locale est affichée.";
      erreur.hidden = false;
      v.poster = ressource.vignette || "";
      v.src = ressource.video;
      v.load();
      const lecture = v.play();
      if (lecture && lecture.catch) lecture.catch(() => {});
      return;
    }
    erreur.textContent = ressource.distante
      ? "Vidéo Elix indisponible. Une connexion Internet est nécessaire."
      : "Vidéo indisponible.";
    erreur.hidden = false;
  });
  return h("span", { class: "conteneur-video-mini" }, v, erreur);
}
