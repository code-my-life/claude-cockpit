(function (root) {
  'use strict';

  // La structure fixe de l'île (HTML), sans donnée : onglets, couches de vues, formulaires, grande entité.
  // Les textes et les listes sont remplis par island-ui.js ; les formulaires ne sont jamais réécrits (ils gardent ce qu'on y tape).
  const tab = (id, label, selected) => `<button type="button" class="ep-tab" role="tab" id="tab-${id}" data-tab="${id}" aria-controls="v-${id}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}">${label}</button>`;
  const slot = cls => `<span class="slot-hero ${cls}" data-slot></span>`;
  const shellHtml = () => `
    <div class="island ep-glass" id="island" role="region" aria-label="Conversations Claude Code" data-hidden="true">
      <div class="stage" id="stage">
        <div class="hdr" id="hdr">
          <div class="ep-tabs" role="tablist" aria-label="Vues de l'île" id="tabs">${tab('home', 'Accueil', true)}${tab('order', 'Envoyer un ordre', false)}${tab('new', 'Nouvelle conversation', false)}</div>
          <button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" id="foldBtn"><span id="foldLabel">Replier</span><kbd class="ep-kbd">Échap</kbd></button>
        </div>
        <div class="layer l-compact" id="v-compact" aria-label="Réduite">
          <button type="button" class="compact" id="compactBtn">${slot('c')}<span class="ep-tag" id="cSig"></span><span class="others" id="cOthers"></span></button>
        </div>
        <div class="layer l-home" id="v-home" role="tabpanel" aria-labelledby="tab-home" aria-label="Accueil">
          <div class="is-body"><div class="home"><div class="is-card">${slot('')}<div class="is-card-text" id="homeText"></div></div><nav class="ep-side-group side" id="homePills" aria-label="Autres conversations"></nav></div><div class="details" id="details" hidden></div></div>
        </div>
        <div class="layer l-wait" id="v-wait" role="group" aria-label="Une conversation t'attend">
          <div class="is-body"><div class="alert">${slot('')}
            <div class="alert-main">
              <h2 class="h4" id="wName"></h2>
              <div class="ep-alert ep-tone-warning" role="status"><div><p class="ep-alert__title"><span>T'attend :</span> <span id="wKind"></span></p><p class="ep-alert__msg" id="wQuote"></p></div></div>
              <form class="reply" id="replyForm" autocomplete="off">
                <div class="ep-field"><label class="ep-label" for="replyInput">Réponse rapide</label><input class="ep-input" id="replyInput" type="text"></div>
                <button type="submit" class="ep-btn ep-btn--primary" id="replySend">Envoyer <span class="ep-icon ep-icon--arrow" aria-hidden="true"></span></button>
              </form>
              <div class="ep-cluster" id="wQuick" role="group" aria-label="Réponses courtes"></div>
              <div class="perm" id="wPerm" hidden>
                <pre class="ep-code" id="wCmd" tabindex="0" aria-label="Ce que Claude veut faire"></pre>
                <div class="is-acts" role="group" aria-label="Décision">
                  <button type="button" class="ep-btn" data-act="perm" data-decision="deny">Refuser</button>
                  <button type="button" class="ep-btn ep-btn--primary" data-act="perm" data-decision="allow">Autoriser</button>
                  <button type="button" class="ep-btn ep-btn--ghost" data-act="perm" data-decision="always" id="wAlways" data-ep-tip="Autoriser et ne plus demander pour cette règle">Toujours</button>
                  <button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="perm" data-decision="defer" data-ep-tip="Laisser Claude afficher sa propre demande">Dans Claude</button>
                </div>
              </div>
              <p class="ep-hint" id="wNote" hidden></p>
              <div class="is-acts" id="wOpen" hidden></div>
            </div>
            <div class="rail" data-rail aria-label="Autres conversations"></div></div></div>
        </div>
        <div class="layer l-order" id="v-order" role="tabpanel" aria-labelledby="tab-order" aria-label="Envoyer un ordre">
          <div class="is-body"><div class="simple">${slot('')}
            <div class="simple-main">
              <div class="is-meta"><h2 class="h4" id="oName"></h2><span class="ep-tag" id="oSig"></span></div>
              <form class="reply" id="orderForm" autocomplete="off">
                <div class="ep-field"><label class="ep-label" for="orderInput">Ordre pour cette conversation</label><textarea class="ep-textarea" id="orderInput" rows="2" aria-describedby="orderHint"></textarea>
                  <span class="ep-hint" id="orderHint">Entrée pour envoyer, Maj+Entrée pour un retour à la ligne. Colle une image si besoin.</span></div>
                <button type="submit" class="ep-btn ep-btn--primary" id="orderSend">Envoyer <span class="ep-icon ep-icon--arrow" aria-hidden="true"></span></button>
              </form>
              <div class="is-thumbs" id="orderThumbs"></div>
              <p class="ep-hint" id="oNote" hidden></p>
            </div></div></div>
        </div>
        <div class="layer l-new" id="v-new" role="tabpanel" aria-labelledby="tab-new" aria-label="Nouvelle conversation">
          <div class="is-body"><div class="simple-main">
            <fieldset class="ep-fieldset"><legend class="ep-label">Dépôt <small>le premier coché est le dossier principal</small></legend>
              <input type="search" class="ep-input" id="newSearch" placeholder="Rechercher un dépôt" aria-label="Rechercher un dépôt">
              <div class="is-list" id="newList" role="group" aria-label="Dépôts connus"></div>
              <div class="ep-cluster" id="newPicked" aria-live="polite"></div>
            </fieldset>
            <div class="reply"><div class="ep-field"><label class="ep-label" for="newInput">Première demande</label><input class="ep-input" id="newInput" type="text"></div>
              <button type="button" class="ep-btn ep-btn--primary" id="startBtn">Démarrer <span class="ep-icon ep-icon--arrow" aria-hidden="true"></span></button></div>
            <p class="ep-hint" id="newNote" role="alert"></p>
          </div></div>
        </div>
        <div class="layer l-park" id="v-park" role="group" aria-label="Mettre de côté">
          <div class="is-body"><div class="simple">${slot('')}
            <div class="simple-main">
              <div class="is-meta"><h2 class="h4" id="pName"></h2><span class="ep-tag" id="pTitle"></span></div>
              <div class="ep-cluster" id="parkChips" role="group" aria-label="Raisons courantes"></div>
              <form class="reply" id="parkForm" autocomplete="off">
                <div class="ep-field"><label class="ep-label" for="parkInput">Raison <small>facultative</small></label><input class="ep-input" id="parkInput" type="text" maxlength="200"></div>
                <button type="submit" class="ep-btn ep-btn--primary" id="parkOk">Mettre de côté</button>
              </form>
              <div class="is-acts"><button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="park-cancel">Annuler</button></div>
            </div></div></div>
        </div>
        <span class="hero" id="hero" aria-hidden="true"><canvas id="heroCanvas"></canvas></span>
      </div>
    </div>`;


  const api = { shellHtml };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandShell = api;
})(typeof window !== 'undefined' ? window : globalThis);
