self.onmessage = (event) => {
  const samples = Array.isArray(event.data?.samples) ? event.data.samples : [];

  if (!samples.length) {
    self.postMessage(null);
    return;
  }

  let fastestIndex = 0;
  let maxDelta = Number.NEGATIVE_INFINITY;
  let brakeEvents = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample.deltaSpeed > maxDelta) {
      maxDelta = sample.deltaSpeed;
      fastestIndex = index;
    }

    if (sample.brake >= 20 && (!samples[index - 1] || samples[index - 1].brake < 20)) {
      brakeEvents += 1;
    }
  }

  self.postMessage({
    fastestIndex,
    fastestElapsed: samples[fastestIndex]?.elapsed ?? 0,
    maxDelta,
    brakeEvents,
    sampledAt: Date.now(),
  });
};
