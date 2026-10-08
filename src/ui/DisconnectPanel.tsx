import * as React from 'react';
import { useEffect, useRef } from 'react';

export type PanelMode = 'disconnect' | 'consent';

export interface PanelStrings {
  disconnectTitle: string;
  disconnectBody: string;
  disconnectDownload: string;
  dismiss: string;
  dontShowAgain: string;
  consentTitle: string;
  consentIntro: string;
  consentItems: string[];
  consentNote: string;
  consentConfirm: string;
  consentCancel: string;
}

interface DisconnectPanelProps {
  mode: PanelMode;
  strings: PanelStrings;
  onRequestDownload: () => void;
  onConfirmDownload: () => void;
  onClose: () => void;
  onDontShowAgain: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 340,
    padding: '16px',
    fontSize: 14,
    lineHeight: 1.45,
    color: '#1c1c1e',
    fontFamily: 'inherit',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: 15,
    fontWeight: 600,
  },
  body: {
    margin: '0 0 12px 0',
  },
  list: {
    margin: '0 0 12px 0',
    paddingLeft: 20,
  },
  note: {
    margin: '0 0 12px 0',
    fontSize: 13,
    color: '#3c3c43',
  },
  buttonRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  primaryButton: {
    background: '#0a5cad',
    color: '#ffffff',
    border: '1px solid #0a5cad',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 14,
    cursor: 'pointer',
  },
  secondaryButton: {
    background: '#ffffff',
    color: '#1c1c1e',
    border: '1px solid #6b6b6b',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: 14,
    cursor: 'pointer',
  },
  // Link-styled but still a real, focusable button (underline keeps it
  // recognizable as interactive without relying on color alone).
  quietButton: {
    background: 'transparent',
    color: '#3c3c43',
    border: 'none',
    padding: '8px 0',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
    marginRight: 'auto',
  },
};

// Inline styles cannot express :focus - a small scoped stylesheet keeps the
// keyboard focus clearly visible on the panel buttons (WCAG 2.4.7).
const FOCUS_CSS = `
  .bbb-log-collection-panel button:focus-visible {
    outline: 3px solid #0a5cad;
    outline-offset: 2px;
  }
`;

/**
 * Content of the plugin's floating window. Two modes:
 *  - "disconnect": shown automatically when a disconnect was detected,
 *    offering to create the log archive (announced via role="alert").
 *  - "consent": GDPR notice that must be confirmed before any download.
 */
export function DisconnectPanel({
  mode, strings, onRequestDownload, onConfirmDownload, onClose, onDontShowAgain,
}: DisconnectPanelProps): React.ReactElement {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The consent dialog is always user-initiated, so moving focus to its
    // primary action is expected; the disconnect alert must not steal focus.
    if (mode === 'consent') {
      primaryRef.current?.focus();
    }
  }, [mode]);

  if (mode === 'consent') {
    return (
      <div
        className="bbb-log-collection-panel"
        style={styles.container}
        role="dialog"
        aria-labelledby="bbb-log-collection-consent-title"
      >
        <style>{FOCUS_CSS}</style>
        <h2 id="bbb-log-collection-consent-title" style={styles.title}>{strings.consentTitle}</h2>
        <p style={styles.body}>{strings.consentIntro}</p>
        <ul style={styles.list}>
          {strings.consentItems.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p style={styles.note}>{strings.consentNote}</p>
        <div style={styles.buttonRow}>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            {strings.consentCancel}
          </button>
          <button type="button" style={styles.primaryButton} onClick={onConfirmDownload} ref={primaryRef}>
            {strings.consentConfirm}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bbb-log-collection-panel" style={styles.container} role="alert">
      <style>{FOCUS_CSS}</style>
      <h2 style={styles.title}>{strings.disconnectTitle}</h2>
      <p style={styles.body}>{strings.disconnectBody}</p>
      <div style={styles.buttonRow}>
        <button type="button" style={styles.quietButton} onClick={onDontShowAgain}>
          {strings.dontShowAgain}
        </button>
        <button type="button" style={styles.secondaryButton} onClick={onClose}>
          {strings.dismiss}
        </button>
        <button type="button" style={styles.primaryButton} onClick={onRequestDownload}>
          {strings.disconnectDownload}
        </button>
      </div>
    </div>
  );
}
