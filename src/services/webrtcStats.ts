import { MAX_STATS_SAMPLES, STATS_SAMPLE_INTERVAL_MS } from '../core/constants';
import { MediaQuality, WebRtcStatsSample } from '../core/types';
import { DisconnectDetector } from './disconnectDetector';
import { RingBuffer } from './logBuffer';

type MediaKind = 'audio' | 'video';

interface LooseStats {
  id: string;
  type: string;
  [key: string]: unknown;
}

// Cumulative counters of one RTP stream, kept to compute per-interval deltas.
interface StreamCounters {
  packetsReceived: number;
  packetsLost: number;
  bytesReceived: number;
  bytesSent: number;
  concealedSamples: number;
  totalSamplesReceived: number;
}

interface TrackedPeer {
  id: string;
  pc: RTCPeerConnection;
  lastSampleAt: number;
  counters: Map<string, StreamCounters>;
  path?: string;
}

interface KindTotals {
  inPackets: number;
  inLost: number;
  inBytes: number;
  inJitterMs?: number;
  concealed: number;
  totalSamples: number;
  outBytes: number;
  outLossPct?: number;
  outJitterMs?: number;
  outRttMs?: number;
  hasIn: boolean;
  hasOut: boolean;
}

const num = (stats: LooseStats | undefined, key: string): number | undefined => {
  const value = stats?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const str = (stats: LooseStats | undefined, key: string): string | undefined => {
  const value = stats?.[key];
  return typeof value === 'string' && value ? value : undefined;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

const max = (current: number | undefined, value: number | undefined): number | undefined => {
  if (value === undefined) return current;
  return current === undefined ? value : Math.max(current, value);
};

const delta = (current: number, previous: number | undefined): number => (
  Math.max(0, current - (previous ?? 0))
);

const kindOf = (stats: LooseStats): MediaKind | undefined => {
  // Older Chromium versions name the field mediaType.
  const kind = str(stats, 'kind') ?? str(stats, 'mediaType');
  return kind === 'audio' || kind === 'video' ? kind : undefined;
};

const emptyTotals = (): KindTotals => ({
  inPackets: 0,
  inLost: 0,
  inBytes: 0,
  concealed: 0,
  totalSamples: 0,
  outBytes: 0,
  hasIn: false,
  hasOut: false,
});

/** "relay udp (TURN over tls) -> host": candidate types only, no addresses. */
function describePath(local?: LooseStats, remote?: LooseStats): string | undefined {
  const localType = str(local, 'candidateType');
  if (!localType) return undefined;
  const protocol = str(local, 'protocol');
  const relayProtocol = str(local, 'relayProtocol');
  const remoteType = str(remote, 'candidateType');
  return `${localType}${protocol ? ` ${protocol}` : ''}`
    + `${localType === 'relay' && relayProtocol ? ` (TURN over ${relayProtocol})` : ''}`
    + `${remoteType ? ` -> ${remoteType}` : ''}`;
}

function toQuality(totals: KindTotals, intervalMs: number, kind: MediaKind): MediaQuality | undefined {
  if (!totals.hasIn && !totals.hasOut) return undefined;
  const quality: MediaQuality = {};
  if (totals.hasIn) {
    quality.inKbps = round1((totals.inBytes * 8) / intervalMs);
    const expected = totals.inPackets + totals.inLost;
    if (expected > 0) quality.inLossPct = round1((totals.inLost / expected) * 100);
    if (totals.inJitterMs !== undefined) quality.inJitterMs = round1(totals.inJitterMs);
    if (kind === 'audio' && totals.totalSamples > 0) {
      quality.concealedPct = round1((totals.concealed / totals.totalSamples) * 100);
    }
  }
  if (totals.hasOut) {
    quality.outKbps = round1((totals.outBytes * 8) / intervalMs);
    if (totals.outLossPct !== undefined) quality.outLossPct = round1(totals.outLossPct);
    if (totals.outJitterMs !== undefined) quality.outJitterMs = round1(totals.outJitterMs);
    if (totals.outRttMs !== undefined) quality.outRttMs = round1(totals.outRttMs);
  }
  return quality;
}

/**
 * Samples getStats() of every open RTCPeerConnection at a fixed interval and
 * keeps a compact quality timeline: round-trip time, packet loss, jitter,
 * bitrate and the network path (direct, or relayed through TURN). The trend
 * before a disconnect shows whether the network degraded - measured on the
 * media connection itself, without extra traffic or any third-party server.
 *
 * Data minimization: only numbers and candidate types leave the stats
 * report - never IP addresses, ports, ICE credentials or track IDs.
 */
export class WebRtcStatsSampler {
  readonly samples = new RingBuffer<WebRtcStatsSample>(MAX_STATS_SAMPLES);

  private peers = new Map<string, TrackedPeer>();

  private timer: ReturnType<typeof setInterval> | undefined;

  private busy = false;

  private enabled = true;

  constructor(
    private detector: DisconnectDetector,
    private intervalMs = STATS_SAMPLE_INTERVAL_MS,
  ) {}

  /** Start sampling a newly created peer connection. */
  track(id: string, pc: RTCPeerConnection): void {
    if (!this.enabled || typeof pc.getStats !== 'function') return;
    this.peers.set(id, {
      id,
      pc,
      lastSampleAt: Date.now(),
      counters: new Map(),
    });
    if (this.timer === undefined) {
      this.timer = setInterval(() => {
        this.sampleAll().catch(() => undefined);
      }, this.intervalMs);
    }
  }

  /** Switching off also drops what was sampled so far. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.peers.clear();
      this.stopTimer();
      this.samples.clear();
    }
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async sampleAll(): Promise<void> {
    // A slow getStats() round must not pile up behind the timer.
    if (this.busy) return;
    this.busy = true;
    try {
      const peers = Array.from(this.peers.values());
      await Promise.all(peers.map((peer) => this.samplePeer(peer).catch(() => {
        // Sampling is optional - drop a connection whose stats keep failing.
        this.peers.delete(peer.id);
      })));
    } finally {
      this.busy = false;
      if (this.peers.size === 0) this.stopTimer();
    }
  }

  private async samplePeer(peer: TrackedPeer): Promise<void> {
    const { pc } = peer;
    // close() does not fire a state change event, so check on every round.
    if (pc.connectionState === 'closed' || pc.signalingState === 'closed') {
      this.peers.delete(peer.id);
      return;
    }

    const report = await pc.getStats();
    if (!this.enabled || !this.peers.has(peer.id)) return;

    const now = Date.now();
    const intervalMs = Math.max(1, now - peer.lastSampleAt);
    peer.lastSampleAt = now;

    const all: LooseStats[] = [];
    report.forEach((stats: LooseStats) => all.push(stats));
    const byId = new Map(all.map((stats) => [stats.id, stats]));

    const sample: WebRtcStatsSample = {
      ts: new Date(now).toISOString(),
      pc: peer.id,
      state: pc.connectionState ?? pc.iceConnectionState,
    };

    let availableOut: number | undefined;
    // The selected ICE candidate pair: via the transport (spec, Chromium,
    // Safari), or flagged on the pair itself (Firefox).
    const transport = all.find((stats) => stats.type === 'transport' && str(stats, 'selectedCandidatePairId'));
    const pair = (transport && byId.get(str(transport, 'selectedCandidatePairId') as string))
      ?? all.find((stats) => stats.type === 'candidate-pair'
        && (stats.selected === true || (stats.nominated === true && stats.state === 'succeeded')));
    if (pair) {
      const path = describePath(
        byId.get(str(pair, 'localCandidateId') ?? ''),
        byId.get(str(pair, 'remoteCandidateId') ?? ''),
      );
      if (path) {
        sample.path = path;
        if (path !== peer.path) {
          this.detector.record('webrtc', false, `${peer.id}: media path is ${path}`);
          peer.path = path;
        }
      }
      const rtt = num(pair, 'currentRoundTripTime');
      if (rtt !== undefined) sample.rttMs = round1(rtt * 1000);
      availableOut = num(pair, 'availableOutgoingBitrate');
    }

    const totals: Record<MediaKind, KindTotals> = { audio: emptyTotals(), video: emptyTotals() };
    const counters = new Map<string, StreamCounters>();
    all.forEach((stats) => {
      const kind = kindOf(stats);
      if (!kind) return;
      const kindTotals = totals[kind];
      const previous = peer.counters.get(stats.id);

      if (stats.type === 'inbound-rtp') {
        const current: StreamCounters = {
          packetsReceived: num(stats, 'packetsReceived') ?? 0,
          packetsLost: num(stats, 'packetsLost') ?? 0,
          bytesReceived: num(stats, 'bytesReceived') ?? 0,
          bytesSent: 0,
          concealedSamples: num(stats, 'concealedSamples') ?? 0,
          totalSamplesReceived: num(stats, 'totalSamplesReceived') ?? 0,
        };
        counters.set(stats.id, current);
        kindTotals.hasIn = true;
        kindTotals.inPackets += delta(current.packetsReceived, previous?.packetsReceived);
        kindTotals.inLost += delta(current.packetsLost, previous?.packetsLost);
        kindTotals.inBytes += delta(current.bytesReceived, previous?.bytesReceived);
        // The first interval of a new stream includes its start-up, which the
        // browser fills in as well - it would read like a dropout.
        if (previous) {
          kindTotals.concealed += delta(current.concealedSamples, previous.concealedSamples);
          kindTotals.totalSamples += delta(current.totalSamplesReceived, previous.totalSamplesReceived);
        }
        const jitter = num(stats, 'jitter');
        kindTotals.inJitterMs = max(kindTotals.inJitterMs, jitter === undefined ? undefined : jitter * 1000);
      } else if (stats.type === 'outbound-rtp') {
        const current: StreamCounters = {
          packetsReceived: 0,
          packetsLost: 0,
          bytesReceived: 0,
          bytesSent: num(stats, 'bytesSent') ?? 0,
          concealedSamples: 0,
          totalSamplesReceived: 0,
        };
        counters.set(stats.id, current);
        kindTotals.hasOut = true;
        kindTotals.outBytes += delta(current.bytesSent, previous?.bytesSent);
      } else if (stats.type === 'remote-inbound-rtp') {
        const fractionLost = num(stats, 'fractionLost');
        const jitter = num(stats, 'jitter');
        const rtt = num(stats, 'roundTripTime');
        kindTotals.outLossPct = max(kindTotals.outLossPct, fractionLost === undefined ? undefined : fractionLost * 100);
        kindTotals.outJitterMs = max(kindTotals.outJitterMs, jitter === undefined ? undefined : jitter * 1000);
        kindTotals.outRttMs = max(kindTotals.outRttMs, rtt === undefined ? undefined : rtt * 1000);
      }
    });
    // Streams that ended since the last round drop out of the baseline.
    peer.counters = counters;

    // Chromium's send bandwidth estimate only stays bounded while there is
    // enough traffic to probe the link: with audio alone it keeps growing up
    // to 1 Gbit/s. It is meaningful only while video is being sent.
    if (availableOut !== undefined && totals.video.outBytes > 0) {
      sample.availableOutKbps = round1(availableOut / 1000);
    }

    const audio = toQuality(totals.audio, intervalMs, 'audio');
    if (audio) sample.audio = audio;
    const video = toQuality(totals.video, intervalMs, 'video');
    if (video) sample.video = video;

    this.samples.push(sample);
  }
}
