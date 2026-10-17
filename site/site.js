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
  
  // Stop animations on flow-type elements if reduced motion
  if (still) {
    document.querySelectorAll('ep-flow-type').forEach(el => {
      el.setAttribute('animate', 'none');
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
      
      // Update the heading text
      const headings = {
        'working': 'En travail',
        'waiting': 'En attente',
        'permission': 'Permission',
        'done': 'Livré',
        'blocked': 'Bloqué',
        'later': 'Plus tard',
        'rest': 'Repos'
      };
      
      const heading = button.closest('.ep-stack').querySelector('p.h4');
      if (heading && headings[state]) {
        heading.textContent = headings[state];
      }
      
      // Update the note text
      const notes = {
        'working': 'Claude travaille : il explore le code ou exécute des commandes.',
        'waiting': 'Claude a posé une question ou terminé : il attend votre réponse.',
        'permission': 'Claude a besoin d\'autorisation pour une commande.',
        'done': 'Mission terminée : la tâche est accomplie.',
        'blocked': 'Claude est bloqué par une erreur ou une décision requise.',
        'later': 'Tâche mise en attente pour plus tard.',
        'rest': 'Aucune activité en cours.'
      };
      
      const note = button.closest('.ep-stack').querySelector('p.ep-note');
      if (note && notes[state]) {
        note.textContent = notes[state];
      }
    });
  });
});