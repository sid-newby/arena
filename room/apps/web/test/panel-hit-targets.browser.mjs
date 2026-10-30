const frame = () => new Promise(requestAnimationFrame);

export async function verifyPanelHitTargets() {
  const slots = [...document.querySelectorAll('.agent-slot')].filter(
    (slot) => slot.getClientRects().length > 0,
  );
  const panels = slots.map((slot) => slot.querySelector(':scope > .agent-slab')).filter(Boolean);
  if (!panels.length) throw new Error('Open the room before checking panel hit targets.');
  const originals = panels.map((panel) => ({ panel, pose: panel.getAttribute('data-pose') }));
  const active = document.activeElement;
  const composers = panels.map((panel) => panel.querySelector('.agent-composer')).filter(Boolean);
  const scrollPositions = composers.map((composer) => ({ composer, top: composer.scrollTop }));
  const disclosures = composers.flatMap((composer) =>
    [...composer.querySelectorAll('.saved-messages')].map((details) => ({
      details,
      open: details.open,
    })),
  );
  const style = document.createElement('style');
  style.textContent = '.agent-slab { transition: none !important; }';
  document.head.appendChild(style);
  const checks = [];
  try {
    for (const pose of ['front', 'left', 'right', 'lean']) {
      for (const panel of panels) panel.setAttribute('data-pose', pose);
      await frame();
      await frame();
      for (const panel of panels) {
        for (const control of panel.querySelectorAll(
          '.agent-composer button:not(:disabled), .agent-composer textarea:not(:disabled), .agent-composer select:not(:disabled)',
        )) {
          control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          await frame();
          const bounds = control.getBoundingClientRect();
          if (!bounds.width || !bounds.height) continue;
          const x = bounds.x + bounds.width / 2;
          const y = bounds.y + bounds.height / 2;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const target = document.elementFromPoint(x, y);
          checks.push({
            pose,
            panel: panel.className,
            control:
              control.getAttribute('aria-label') || control.textContent.trim() || control.tagName,
            hit: target?.tagName,
            passed: target === control || control.contains(target),
          });
        }
      }
    }
    if (matchMedia('(max-width: 700px), (max-height: 760px)').matches) {
      for (const expanded of [false, true]) {
        for (const { details } of disclosures) details.open = expanded;
        await frame();
        for (const panel of panels) {
          const thread = panel.querySelector('.agent-thread');
          const face = panel.querySelector('.slab-face');
          checks.push({
            control: `Readable thread with ${expanded ? 'expanded' : 'collapsed'} receipts`,
            height: thread?.clientHeight,
            passed: thread?.clientHeight >= 100,
          });
          checks.push({
            control: 'Panel content stays within the slab',
            passed: face.scrollHeight <= face.clientHeight + 1,
          });
        }
      }
    }
    for (const slot of slots) {
      slot.focus();
      checks.push({ control: 'Tabpanel keyboard focus', passed: document.activeElement === slot });
      const input = slot.querySelector('textarea:not(:disabled)');
      if (input) {
        input.focus();
        checks.push({
          control: 'Composer keyboard focus',
          passed: document.activeElement === input,
        });
      }
    }
    return { passed: checks.every((check) => check.passed), checks };
  } finally {
    for (const { panel, pose } of originals) {
      if (pose === null) panel.removeAttribute('data-pose');
      else panel.setAttribute('data-pose', pose);
    }
    style.remove();
    for (const { details, open } of disclosures) details.open = open;
    for (const { composer, top } of scrollPositions) composer.scrollTop = top;
    if (active instanceof HTMLElement) active.focus();
  }
}
