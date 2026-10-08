import * as React from 'react';
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  BbbPluginSdk,
  OptionsDropdownOption,
  PluginApi,
  pluginLogger,
} from 'bigbluebutton-html-plugin-sdk';
import { defineMessages, IntlProvider, useIntl } from 'react-intl';

import { ALERT_SUPPRESS_AFTER_DISMISS_MS } from '../core/constants';
import { PluginRootProps, PluginSettingsShape, SessionMeta } from '../core/types';
import { getCaptureCore } from '../services/capture';
import { setParticipants } from '../services/redact';
import { exportLogsAsZip } from '../services/zipExport';
import { DisconnectPanel, PanelMode, PanelStrings } from '../ui/DisconnectPanel';
import { removePanel, renderPanel } from '../ui/panelHost';

const messages = defineMessages({
  optionsDropdownLabel: {
    id: 'bbbPluginLogCollection.optionsDropdown.label',
    defaultMessage: 'Download diagnostic logs (ZIP)',
  },
  disconnectTitle: {
    id: 'bbbPluginLogCollection.panel.disconnect.title',
    defaultMessage: 'Connection problem detected',
  },
  disconnectBody: {
    id: 'bbbPluginLogCollection.panel.disconnect.body',
    defaultMessage: 'The session logs can help our support find the cause. You can save them as a ZIP file now.',
  },
  disconnectDownload: {
    id: 'bbbPluginLogCollection.panel.disconnect.download',
    defaultMessage: 'Create log file…',
  },
  dismiss: {
    id: 'bbbPluginLogCollection.panel.dismiss',
    defaultMessage: 'Dismiss',
  },
  dontShowAgain: {
    id: 'bbbPluginLogCollection.panel.dontShowAgain',
    defaultMessage: "Don't show again",
  },
  consentTitle: {
    id: 'bbbPluginLogCollection.consent.title',
    defaultMessage: 'Privacy notice - diagnostic logs',
  },
  consentIntro: {
    id: 'bbbPluginLogCollection.consent.intro',
    defaultMessage: 'The ZIP file is created only on your device and contains:',
  },
  consentItem1: {
    id: 'bbbPluginLogCollection.consent.item1',
    defaultMessage: 'Technical browser logs of this session',
  },
  consentItem2: {
    id: 'bbbPluginLogCollection.consent.item2',
    defaultMessage: 'Connection events (e.g. audio disconnects)',
  },
  consentItem3: {
    id: 'bbbPluginLogCollection.consent.item3',
    defaultMessage: 'Browser and device information, your user and meeting ID',
  },
  consentNote: {
    id: 'bbbPluginLogCollection.consent.note',
    defaultMessage: 'Access data and names of other participants are removed or pseudonymized as far as possible. Nothing is transmitted automatically — you decide whether to share the file with support.',
  },
  consentConfirm: {
    id: 'bbbPluginLogCollection.consent.confirm',
    defaultMessage: 'Agree & download',
  },
  consentCancel: {
    id: 'bbbPluginLogCollection.consent.cancel',
    defaultMessage: 'Cancel',
  },
});

interface ContentProps {
  pluginApi: PluginApi;
}

function PluginLogCollectionContent({ pluginApi }: ContentProps): React.ReactElement | null {
  const intl = useIntl();
  const core = useMemo(() => getCaptureCore(), []);
  const [panelMode, setPanelMode] = useState<PanelMode | 'hidden'>('hidden');
  // After the user dismissed the panel, a lingering bad connection keeps
  // firing alerts — do not nag again for a while.
  const suppressAlertsUntil = useRef(0);
  // Whether the currently open panel/dialog was opened by a disconnect alert
  // ('alert') or by the user via the options dropdown ('manual'). Only the
  // alert flow may suppress future alerts — a manual download must never
  // silence the disconnect panel.
  const panelOrigin = useRef<'alert' | 'manual'>('manual');

  // The SDK types mark its hooks as optional, but BbbPluginSdk.initialize
  // guarantees they exist at runtime — hence the non-null assertions.
  const meetingInfo = pluginApi.useMeeting!();
  const currentUser = pluginApi.useCurrentUser!();
  const usersBasicInfo = pluginApi.useUsersBasicInfo!();
  const pluginSettings = pluginApi.usePluginSettings!();

  const settings = (pluginSettings?.data ?? {}) as PluginSettingsShape;

  // Keep the pseudonymization table in sync with the meeting roster.
  useEffect(() => {
    const users = usersBasicInfo?.data?.user;
    if (users) {
      setParticipants(
        users.map((user) => ({ userId: user.userId, name: user.name })),
        currentUser?.data?.userId,
      );
    }
  }, [usersBasicInfo?.data, currentUser?.data?.userId]);

  // Apply the configured buffer size.
  useEffect(() => {
    if (typeof settings.maxLogEntries === 'number' && settings.maxLogEntries > 0) {
      core.logs.setCapacity(settings.maxLogEntries);
    }
  }, [core, settings.maxLogEntries]);

  const sessionMeta = useMemo<SessionMeta>(() => ({
    meetingId: meetingInfo?.data?.meetingId,
    meetingName: meetingInfo?.data?.name,
    userId: currentUser?.data?.userId,
    userName: currentUser?.data?.name,
    userRole: currentUser?.data?.role,
  }), [meetingInfo?.data, currentUser?.data]);

  const doExport = useCallback(() => {
    try {
      exportLogsAsZip(core, sessionMeta);
      pluginLogger.info('Log archive exported by the user');
    } catch (error) {
      pluginLogger.error('Failed to export log archive', error);
    }
    if (panelOrigin.current === 'alert') {
      suppressAlertsUntil.current = Date.now() + ALERT_SUPPRESS_AFTER_DISMISS_MS;
    }
    setPanelMode('hidden');
  }, [core, sessionMeta]);

  // Entry point 1: options dropdown (top right, next to "Leave meeting").
  // The download always goes through the consent dialog first.
  useEffect(() => {
    pluginApi.setOptionsDropdownItems([
      new OptionsDropdownOption({
        label: intl.formatMessage(messages.optionsDropdownLabel),
        icon: 'download',
        dataTest: 'logCollectionDownloadOption',
        onClick: () => {
          panelOrigin.current = 'manual';
          setPanelMode('consent');
        },
      }),
    ]);
  }, [pluginApi, intl]);

  // Entry point 2: a detected disconnect opens the offer panel (unless the
  // consent dialog is already open or the admin disabled the panel).
  useEffect(() => {
    if (settings.showDisconnectPanel === false) return undefined;
    return core.detector.onAlert(() => {
      if (Date.now() < suppressAlertsUntil.current) return;
      setPanelMode((current) => {
        if (current !== 'hidden') return current;
        panelOrigin.current = 'alert';
        return 'disconnect';
      });
    });
  }, [core, settings.showDisconnectPanel]);

  const closePanel = useCallback(() => {
    if (panelOrigin.current === 'alert') {
      suppressAlertsUntil.current = Date.now() + ALERT_SUPPRESS_AFTER_DISMISS_MS;
    }
    setPanelMode('hidden');
  }, []);

  // Suppress the auto-panel for the rest of the meeting (page session);
  // the options-dropdown download stays available.
  const dontShowAgain = useCallback(() => {
    suppressAlertsUntil.current = Number.POSITIVE_INFINITY;
    setPanelMode('hidden');
  }, []);

  const panelStrings = useMemo<PanelStrings>(() => ({
    disconnectTitle: intl.formatMessage(messages.disconnectTitle),
    disconnectBody: intl.formatMessage(messages.disconnectBody),
    disconnectDownload: intl.formatMessage(messages.disconnectDownload),
    dismiss: intl.formatMessage(messages.dismiss),
    dontShowAgain: intl.formatMessage(messages.dontShowAgain),
    consentTitle: intl.formatMessage(messages.consentTitle),
    consentIntro: intl.formatMessage(messages.consentIntro),
    consentItems: [
      intl.formatMessage(messages.consentItem1),
      intl.formatMessage(messages.consentItem2),
      intl.formatMessage(messages.consentItem3),
    ],
    consentNote: intl.formatMessage(messages.consentNote),
    consentConfirm: intl.formatMessage(messages.consentConfirm),
    consentCancel: intl.formatMessage(messages.consentCancel),
  }), [intl]);

  // Render/replace the panel whenever its state changes. It sits top-right,
  // below the area where BBB shows its toast messages ("Connection lost", ...)
  // and stays clickable above BBB's connection-lost modal overlay
  // (see panelHost.tsx for why the SDK FloatingWindow cannot be used here).
  useEffect(() => {
    if (panelMode === 'hidden') {
      removePanel();
      return;
    }
    renderPanel(
      <DisconnectPanel
        mode={panelMode}
        strings={panelStrings}
        onRequestDownload={() => setPanelMode('consent')}
        onConfirmDownload={doExport}
        onClose={closePanel}
        onDontShowAgain={dontShowAgain}
      />,
    );
  }, [panelMode, panelStrings, doExport, closePanel, dontShowAgain]);

  // Take the panel down with the plugin.
  useEffect(() => () => removePanel(), []);

  return null;
}

function PluginLogCollection({ pluginUuid }: PluginRootProps): React.ReactElement {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);
  const { messages: localeMessages, currentLocale } = pluginApi.useLocaleMessages!();

  return (
    <IntlProvider
      locale={currentLocale || 'en'}
      messages={localeMessages}
      defaultLocale="en"
    >
      <PluginLogCollectionContent pluginApi={pluginApi} />
    </IntlProvider>
  );
}

export default PluginLogCollection;
