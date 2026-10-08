import * as React from 'react';
import * as ReactDOM from 'react-dom/client';

/**
 * Renders the panel into an own container appended to document.body instead
 * of the SDK's FloatingWindow. Reason: BBB renders floating windows inside
 * `#app`, which is a stacking context pinned to `z-index: 1000 !important`,
 * while BBB's modals — including the overlay shown when the connection is
 * lost — are body-level portals at z-index 1001-1003. A floating window can
 * therefore never be clicked while that overlay is up, which is exactly the
 * moment this panel matters. A body-level container above the modal layer
 * stays clickable. (We only add our own element; BBB's DOM is untouched.)
 */

const PANEL_Z_INDEX = '1060';

let container: HTMLDivElement | null = null;
let root: ReactDOM.Root | null = null;

export function renderPanel(element: React.ReactElement): void {
  if (!container) {
    container = document.createElement('div');
    container.setAttribute('data-test', 'logCollectionPanel');
    Object.assign(container.style, {
      position: 'fixed',
      top: '140px',
      right: '16px',
      width: 'min(372px, calc(100vw - 32px))',
      zIndex: PANEL_Z_INDEX,
      background: '#ffffff',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
    });
    document.body.appendChild(container);
  }
  if (!root) {
    root = ReactDOM.createRoot(container);
  }
  root.render(element);
}

export function removePanel(): void {
  if (root) {
    root.unmount();
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
}
