"use client";

import {
  parseLiveTimingPayload,
  type LiveTimingConnection,
  type LiveTimingFrame,
} from "./live-timing-protocol";

type LiveTimingHandlers = {
  onFrame: (frame: LiveTimingFrame, connection: LiveTimingConnection) => void;
  onStatus?: (connection: LiveTimingConnection) => void;
};

type LiveTimingSubscription = {
  close: () => void;
};

const LOCAL_STREAM_URL = "/api/live-timing";
const WEBSOCKET_SILENCE_MS = 15_000;
const REPLAY_SILENCE_MS = 30_000;

export function connectLiveTimingStream(
  handlers: LiveTimingHandlers,
): LiveTimingSubscription {
  const configuredWsUrl = process.env.NEXT_PUBLIC_LIVE_TIMING_WS_URL;
  let closed = false;
  let websocket: WebSocket | null = null;
  let eventSource: EventSource | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let status: LiveTimingConnection | null = null;

  const report = (next: LiveTimingConnection) => {
    if (!closed && status !== next) {
      status = next;
      handlers.onStatus?.(next);
    }
  };
  const clearWatchdog = () => {
    if (watchdog !== null) clearTimeout(watchdog);
    watchdog = null;
  };
  const retireWebSocket = () => {
    const previous = websocket;
    websocket = null;
    if (previous) {
      previous.onmessage = previous.onerror = previous.onclose = null;
      previous.close();
    }
  };
  const watchReplay = () => {
    clearWatchdog();
    watchdog = setTimeout(() => report("offline"), REPLAY_SILENCE_MS);
  };

  const openEventSource = () => {
    if (closed || eventSource) {
      return;
    }

    clearWatchdog();
    retireWebSocket();
    report("offline");
    try {
      eventSource = new EventSource(LOCAL_STREAM_URL);
    } catch {
      return;
    }
    const source = eventSource;
    watchReplay();

    eventSource.onmessage = (event) => {
      if (closed || eventSource !== source) return;
      const frame = parseLiveTimingPayload(event.data);
      if (frame) {
        watchReplay();
        report("eventsource");
        handlers.onFrame(frame, "eventsource");
      }
    };

    eventSource.onerror = () => {
      if (closed || eventSource !== source) return;
      clearWatchdog();
      report("offline");
      // EventSource owns reconnect/backoff. A valid frame restores the status.
    };
  };

  report("offline");
  if (configuredWsUrl) {
    try {
      websocket = new WebSocket(configuredWsUrl);
      const socket = websocket;
      const watchWebSocket = () => {
        clearWatchdog();
        watchdog = setTimeout(openEventSource, WEBSOCKET_SILENCE_MS);
      };
      watchWebSocket();

      websocket.onmessage = (event) => {
        if (closed || websocket !== socket || eventSource) return;
        const frame = parseLiveTimingPayload(String(event.data));
        if (frame) {
          watchWebSocket();
          report("websocket");
          handlers.onFrame(frame, "websocket");
        }
      };

      websocket.onerror = openEventSource;
      websocket.onclose = openEventSource;
    } catch {
      openEventSource();
    }
  } else {
    openEventSource();
  }

  return {
    close: () => {
      closed = true;
      clearWatchdog();
      retireWebSocket();
      if (eventSource) {
        eventSource.onmessage = eventSource.onerror = null;
        eventSource.close();
        eventSource = null;
      }
    },
  };
}
