import { h, icone, lienExterne } from "./ui.js";

// Lecteur d'un signe : boucle, ralenti, revoir, navigation entre vidéos, crédit.
export function lecteur(sens, { controles = true, credit = true, index = null, onIndexChange = () => {} } = {}) {
  const res = sens.ressources;
  let i = index ?? Math.floor(Math.random() * res.length);
  let lent = false;

  const video = h("video", {
    class: "video", muted: true, playsInline: true, loop: true, autoplay: true,
    preload: "auto", "aria-label": "Vidéo du signe",
  });
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  const cadre = h("div", { class: "cadre-video" }, video);
  const ligneCredit = h("p", { class: "credit" });

  function charger() {
    const r = res[i];
    video.poster = r.vignette;
    video.src = r.video;
    video.playbackRate = lent ? 0.5 : 1;
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
    ligneCredit.replaceChildren(
      res.length > 1 ? `Vidéo ${i + 1} sur ${res.length} · ` : "",
      lienExterne(r.origine, r.auteur), ` · ${r.licence}`,
    );
  }
  function changer(delta) {
    i = (i + delta + res.length) % res.length;
    charger();
    onIndexChange(i);
  }
  video.addEventListener("loadedmetadata", () => { video.playbackRate = lent ? 0.5 : 1; });

  if (res.length > 1) {
    let depart = null;
    cadre.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary) return;
      depart = { x: e.clientX, y: e.clientY, id: e.pointerId };
      cadre.setPointerCapture(e.pointerId);
    });
    cadre.addEventListener("pointerup", (e) => {
      if (!depart || depart.id !== e.pointerId) return;
      const dx = e.clientX - depart.x;
      const dy = e.clientY - depart.y;
      depart = null;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25) changer(dx < 0 ? 1 : -1);
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
    h("button", { type: "button", class: "btn-mini", "aria-label": "Vidéo suivante", onclick: () => changer(1) }, "Suivante")) : null;
  const barre = controles ? h("div", { class: "controles" },
    navigation,
    h("button", { type: "button", class: "btn-mini", onclick: () => { video.currentTime = 0; video.play().catch(() => {}); } },
      icone("revoir", 18), "Revoir"),
    btnLent,
  ) : null;

  charger();
  return h("div", { class: "lecteur" }, cadre, barre, credit ? ligneCredit : null);
}

// Petite vidéo muette pour les choix (QCM mot → vidéo, paires).
export function miniVideo(sens) {
  const r = sens.ressources[Math.floor(Math.random() * sens.ressources.length)];
  const v = h("video", { class: "mini-video", muted: true, playsInline: true, loop: true, autoplay: true, preload: "auto", poster: r.vignette, src: r.video });
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  return v;
}
