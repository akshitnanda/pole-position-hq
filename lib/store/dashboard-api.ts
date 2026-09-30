import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { markWebSocketLag } from "@/lib/analytics";
import { connectLiveTimingStream } from "@/lib/live-stream";
import { saveDashboardSnapshot } from "@/lib/offline-cache";
import type { DashboardData } from "@/lib/types";

export const dashboardApi = createApi({
  reducerPath: "dashboardApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/", timeout: 45_000 }),
  tagTypes: ["Dashboard"],
  endpoints: (builder) => ({
    getDashboard: builder.query<DashboardData, void>({
      query: () => ({ url: "api/dashboard", cache: "no-store" }),
      providesTags: ["Dashboard"],
      async onCacheEntryAdded(
        _arg,
        { cacheDataLoaded, cacheEntryRemoved, updateCachedData },
      ) {
        try {
          const { data } = await cacheDataLoaded;
          void saveDashboardSnapshot(data);

          const stream = connectLiveTimingStream({
            onFrame: (frame, connection) => {
              updateCachedData((draft) => {
                draft.liveTiming = {
                  connection,
                  receivedAt: frame.receivedAt,
                  sampleIndex: frame.sampleIndex ?? draft.liveTiming.sampleIndex,
                  trackPosition:
                    frame.trackPosition ?? draft.liveTiming.trackPosition,
                  latencyMs: frame.latencyMs ?? draft.liveTiming.latencyMs,
                };

                if (frame.raceControl && connection === "websocket") {
                  draft.raceControl = frame.raceControl;
                }

                // Transport frames move the playback cursor; they do not replace
                // the archived car-data trace or establish its freshness.
              });

              if (typeof frame.latencyMs === "number") {
                markWebSocketLag(frame.latencyMs);
              }
            },
            onStatus: (connection) => {
              updateCachedData((draft) => {
                draft.liveTiming.connection = connection;
              });
            },
          });

          await cacheEntryRemoved;
          stream.close();
        } catch {
          await cacheEntryRemoved;
        }
      },
    }),
  }),
});

export const { useGetDashboardQuery } = dashboardApi;
