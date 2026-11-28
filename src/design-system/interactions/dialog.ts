/** Keep native dialog keyboard traversal inside its visible enabled controls.
 * Opening, guarded dismissal, narration cancellation and focus restoration remain
 * with the owning host. Returns cleanup for components with a disposal lifecycle. */
export function containDialogFocus(dialog: HTMLDialogElement, fallback: HTMLElement): () => void {
  const onKey = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    )].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); fallback.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  };
  dialog.addEventListener('keydown', onKey);
  return () => dialog.removeEventListener('keydown', onKey);
}
