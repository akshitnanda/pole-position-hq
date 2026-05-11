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

export function connectLiveTimingStream(
  handlers: LiveTimingHandlers,
): LiveTimingSubscription {
  const configuredWsUrl = process.env.NEXT_PUBLIC_LIVE_TIMING_WS_URL;
  let closed = false;
  let websocket: WebSocket | null = null;
  let eventSource: EventSource | null = null;

  const openEventSource = () => {
    if (closed || eventSource) {
      return;
    }

    eventSource = new EventSource(LOCAL_STREAM_URL);
    handlers.onStatus?.("eventsource");

    eventSource.onmessage = (event) => {
      const frame = parseLiveTimingPayload(event.data);
      if (frame) {
        handlers.onFrame(frame, "eventsource");
      }
    };

    eventSource.onerror = () => {
      handlers.onStatus?.("offline");
    };
  };

  if (configuredWsUrl) {
    try {
      websocket = new WebSocket(configuredWsUrl);
      handlers.onStatus?.("websocket");

      websocket.onmessage = (event) => {
        const frame = parseLiveTimingPayload(String(event.data));
        if (frame) {
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
      websocket?.close();
      eventSource?.close();
    },
  };
}
