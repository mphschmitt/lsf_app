import { h, icone, lienExterne } from "./ui.js";

// Lecteur d'un signe : boucle, ralenti, revoir, choix du signeur, crédit.
export function lecteur(sens, { controles = true, credit = true, index = null } = {}) {
  const res = sens.ressources;
  let i = index ?? Math.floor(Math.random() * res.length);
  let lent = false;

  const video = h("video", {
    class: "video", muted: true, playsInline: true, loop: true, autoplay: true,
    preload: "auto", "aria-label": "Vidéo du signe",
  });
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  const ligneCredit = h("p", { class: "credit" });

  function charger() {
    const r = res[i];
    video.poster = r.vignette;
    video.src = r.video;
    video.playbackRate = lent ? 0.5 : 1;
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
    ligneCredit.replaceChildren(
      res.length > 1 ? `Signeur ${i + 1} sur ${res.length} · ` : "",
      lienExterne(r.origine, r.auteur), ` · ${r.licence}`,
    );
  }
  video.addEventListener("loadedmetadata", () => { video.playbackRate = lent ? 0.5 : 1; });

  const btnLent = h("button", { type: "button", class: "btn-mini", "aria-pressed": "false",
    onclick: () => {
      lent = !lent;
      video.playbackRate = lent ? 0.5 : 1;
      btnLent.setAttribute("aria-pressed", String(lent));
      btnLent.classList.toggle("actif", lent);
    } }, "Ralenti 0,5×");
  const barre = controles ? h("div", { class: "controles" },
    h("button", { type: "button", class: "btn-mini", onclick: () => { video.currentTime = 0; video.play().catch(() => {}); } },
      icone("revoir", 18), "Revoir"),
    btnLent,
    res.length > 1 ? h("button", { type: "button", class: "btn-mini", onclick: () => { i = (i + 1) % res.length; charger(); } }, "Autre signeur") : null,
  ) : null;

  charger();
  return h("div", { class: "lecteur" }, h("div", { class: "cadre-video" }, video), barre, credit ? ligneCredit : null);
}

// Petite vidéo muette pour les choix (QCM mot → vidéo, paires).
export function miniVideo(sens) {
  const r = sens.ressources[Math.floor(Math.random() * sens.ressources.length)];
  const v = h("video", { class: "mini-video", muted: true, playsInline: true, loop: true, autoplay: true, preload: "auto", poster: r.vignette, src: r.video });
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  return v;
}
