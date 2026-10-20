/**
 * Single source of truth for the reply field markup.
 * Matches the validated mockup: input.ep-input + button.send with inline SVG arrow.
 * No disc, no fill, same ink colour as the text, Enter sends via form submit.
 */

function renderReplyField() {
  return `<form class="reply" id="replyForm" autocomplete="off">
  <input class="ep-input" id="replyInput" type="text" placeholder="Répondre…" />
  <button class="send" type="submit" aria-label="Envoyer">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 12h13" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  </button>
</form>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderReplyField };
}