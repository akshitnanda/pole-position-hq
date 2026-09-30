import { encodeLiveTimingFrame } from "@/lib/live-timing-protocol";
import { getDashboardData } from "@/lib/dashboard-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dashboard = await getDashboardData();
  const samples = dashboard.telemetrySamples.length
    ? dashboard.telemetrySamples
    : [{ index: 0, trackPosition: 0 }];
  let index = 0;

  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = () => {
        const sample = samples[index % samples.length];
        const frame = encodeLiveTimingFrame({
          type: "telemetry",
          receivedAt: new Date().toISOString(),
          sampleIndex: sample.index ?? index % samples.length,
          trackPosition: sample.trackPosition ?? 0,
        });

        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
        index += 1;
      };

      send();
      timer = setInterval(send, 100);
    },
    cancel() {
      if (timer) {
        clearInterval(timer);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
