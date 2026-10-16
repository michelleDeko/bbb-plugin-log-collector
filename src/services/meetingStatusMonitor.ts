import { DisconnectDetector } from './disconnectDetector';

// Window event of the BBB core (plugin SDK HookEvents, not exported by the
// SDK package), dispatched whenever userCurrentlyInMeeting changes. It turns
// false only when the meeting ended, the user was removed, logged out or got
// a join error (presenceManager in bigbluebutton-html5) - never because of a
// network problem.
const MEETING_STATUS_EVENT = 'BBB_CORE_UPDATED_MEETING_STATUS';

interface MeetingStatusDetail {
  data?: { userCurrentlyInMeeting?: boolean };
}

/**
 * Tells the detector when the user leaves the meeting on purpose, so the
 * connections BBB closes afterwards are not reported as disconnects.
 */
export function installMeetingStatusMonitor(detector: DisconnectDetector): void {
  // BBB also reports "not in the meeting" while the client is still joining.
  let wasInMeeting = false;

  window.addEventListener(MEETING_STATUS_EVENT, (event: Event) => {
    const inMeeting = (event as CustomEvent<MeetingStatusDetail>).detail?.data?.userCurrentlyInMeeting;
    if (inMeeting === true) {
      wasInMeeting = true;
      detector.markSessionActive();
    } else if (inMeeting === false && wasInMeeting) {
      detector.markSessionEnded('the meeting ended, or the user was removed or left');
    }
  });
}
