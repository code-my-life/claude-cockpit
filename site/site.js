// site.js - Claude Cockpit site interactivity
// Background animation respects prefers-reduced-motion
// Keyboard access for sg-flip cards
// Card state buttons functionality

document.addEventListener('DOMContentLoaded', () => {
  // Check for reduced motion preference
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Initialize background animation
  const bgElement = document.getElementById('cc-bg');
  if (bgElement && window.BgGen) {
    BgGen.mount(bgElement, {
      type: 'metaballs-page',
      seed: 'cockpit',
      intensity: 1,
      live: !still
    });
  }
  
  // Keyboard accessibility for sg-flip cards
  document.querySelectorAll('sg-flip[tabindex]').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.flip(!el.flipped);
      }
    });
  });
  
  // Card state buttons in #cards section
  const stateButtons = document.querySelectorAll('.cc-state .ep-toggle button');
  stateButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Update aria-pressed for all buttons
      stateButtons.forEach(btn => {
        btn.setAttribute('aria-pressed', 'false');
      });
      // Set clicked button to pressed
      button.setAttribute('aria-pressed', 'true');
      
      // Get the state value
      const state = button.getAttribute('data-state');
      
      // Find the card in the same .cc-state container
      const stateContainer = button.closest('.cc-state');
      if (stateContainer) {
        const card = stateContainer.querySelector('sg-card');
        if (card) {
          // Update the card's state attribute
          card.setAttribute('state', state);
        }
      }
      
      // The heading takes the label of the pressed button, so it follows the page language
      const heading = button.closest('.ep-stack').querySelector('p.h4');
      if (heading) {
        heading.textContent = button.textContent.trim();
      }

      // Update the note text, in the language of the page
      const notes = document.documentElement.lang === 'fr' ? {
        'working': 'Claude travaille : il explore le code ou exécute des commandes.',
        'waiting': 'Claude a posé une question ou terminé : il attend votre réponse.',
        'permission': 'Claude a besoin d\'autorisation pour une commande.',
        'done': 'Mission terminée : la tâche est accomplie.',
        'blocked': 'Claude est bloqué par une erreur ou une décision requise.',
        'later': 'Tâche mise en attente pour plus tard.',
        'rest': 'Aucune activité en cours.'
      } : {
        'working': 'Claude is working: exploring the code or running commands.',
        'waiting': 'Claude asked a question or finished: it waits for your answer.',
        'permission': 'Claude needs your permission to run a command.',
        'done': 'Mission done: the task is complete.',
        'blocked': 'Claude is blocked by an error or a decision it needs.',
        'later': 'Set aside for later.',
        'rest': 'Nothing in progress.'
      };

      const note = button.closest('.ep-stack').querySelector('p.ep-note');
      if (note && notes[state]) {
        note.textContent = notes[state];
      }
    });
  });

  // Section entrances: the parts of each section rise in turn as it enters (heading, text, then
  // the pictures), once. Only when motion is allowed and the browser can observe: otherwise no part
  // is ever hidden (the hidden starting state lives in CSS under prefers-reduced-motion: no-preference).
  if (!still && 'IntersectionObserver' in window) {
    const PARTS = [
      ':scope > .cc-hero > *',
      ':scope > h2', ':scope > h3', ':scope > p',
      ':scope > .cc-grid-2 > *', ':scope > .cc-grid-3 > *', ':scope > .cc-grid-4 > *',
      ':scope > .cc-track > *', ':scope > .cc-band > *', ':scope > .cc-state',
      ':scope > .ep-plate', ':scope > .ep-cluster', ':scope > .ep-stack',
    ].join(', ');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        // A part shows once it reaches the screen, or once a fast scroll has already carried it past
        if (!entry.isIntersecting && entry.boundingClientRect.top > 0) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    });
    document.querySelectorAll('main section').forEach(section => {
      // Cards are left out: an opacity fade on a 3D flip flattens it while it runs
      const parts = Array.from(section.querySelectorAll(PARTS)).filter(part => !part.matches('sg-flip') && !part.querySelector('sg-flip'));
      parts.forEach((part, index) => {
        part.style.setProperty('--cc-delay', `${Math.min(index, 6) * 70}ms`);
        part.classList.add('cc-reveal');
        observer.observe(part);
      });
    });
  }
});
