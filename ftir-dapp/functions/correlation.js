// functions/correlation.js
const fileName = args[0];
const goldenData = JSON.parse(args[1]);
const sampleData = JSON.parse(args[2]);

function calculateCorrelation(golden, sample) {
  if (golden.length !== sample.length) {
    throw new Error("Array length mismatch");
  }

  const n = golden.length;
  const meanGolden = golden.reduce((a, b) => a + b, 0) / n;
  const meanSample = sample.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomGolden = 0;
  let denomSample = 0;

  for (let i = 0; i < n; i++) {
    const gDiff = golden[i] - meanGolden;
    const sDiff = sample[i] - meanSample;
    numerator += gDiff * sDiff;
    denomGolden += gDiff * gDiff;
    denomSample += sDiff * sDiff;
  }

  denomGolden = Math.sqrt(denomGolden);
  denomSample = Math.sqrt(denomSample);

  if (denomGolden === 0 || denomSample === 0) {
    return { result: false, percentage: 0 };
  }

  const correlation = numerator / (denomGolden * denomSample);
  const percentage = Math.round(correlation * 10000);
  return { result: correlation > 0.95, percentage };
}

try {
  const result = calculateCorrelation(goldenData, sampleData);
  return Functions.encodeBool(result.result) + Functions.encodeUint256(result.percentage);
} catch (error) {
  throw new Error(`Calculation failed: ${error.message}`);
}