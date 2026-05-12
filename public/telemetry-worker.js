self.onmessage = (event) => {
  const samples = Array.isArray(event.data?.samples) ? event.data.samples : [];

  if (!samples.length) {
    self.postMessage(null);
    return;
  }

  let fastestIndex = 0;
  let maxDelta = Number.NEGATIVE_INFINITY;
  let brakeEvents = 0;
  let accelerationTotal = 0;
  let accelerationSamples = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample.deltaSpeed > maxDelta) {
      maxDelta = sample.deltaSpeed;
      fastestIndex = index;
    }

    if (sample.brake >= 20 && (!samples[index - 1] || samples[index - 1].brake < 20)) {
      brakeEvents += 1;
    }

    const previous = samples[index - 1];
    if (previous && sample.elapsed > previous.elapsed) {
      accelerationTotal +=
        (sample.speed - previous.speed) / Math.max(0.1, sample.elapsed - previous.elapsed);
      accelerationSamples += 1;
    }
  }

  const tail = samples.slice(-3);
  const projectedNextSpeed = tail.length
    ? tail.reduce((sum, sample) => sum + sample.speed + sample.deltaSpeed * 0.15, 0) /
      tail.length
    : samples[fastestIndex]?.speed ?? 0;

  self.postMessage({
    fastestIndex,
    fastestElapsed: samples[fastestIndex]?.elapsed ?? 0,
    maxDelta,
    brakeEvents,
    avgAcceleration:
      accelerationSamples > 0 ? accelerationTotal / accelerationSamples : 0,
    projectedNextSpeed,
    sampledAt: Date.now(),
  });
};
