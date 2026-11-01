const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {runSuite, fingerprint} = require('./cad-suite.cjs');
const {compareReports} = require('./test-scheduler.cjs');

async function main() {
  const runs = path.join(__dirname, 'test-runs');
  const directory = fs.mkdtempSync(path.join(runs, 'scaling-'));
  // Give every run the same longest-first ordering, independent of whether
  // timings for that particular worker count already exist.
  const history = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-timings.json'), 'utf8'));
  const seed = {version: 1, jobs: {}};
  for (const [id, samples] of Object.entries(history.jobs)) {
    const reference = samples[2]?.length ? samples[2] : samples[4] || [];
    seed.jobs[id] = Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [n, [...reference]]));
  }
  const historyPath = path.join(directory, 'timings.json');
  fs.writeFileSync(historyPath, JSON.stringify(seed, null, 2));
  const report = {
    startedAt: new Date().toISOString(),
    node: process.version,
    cpu: os.cpus()[0]?.model,
    logicalProcessors: os.cpus().length,
    fingerprint: fingerprint().hash,
    ordering: 'Identical timing seed from 2-worker history, falling back to 4-worker history',
    results: []
  };
  const reportPath = path.join(directory, 'benchmark.json');
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  save();
  console.log(`Benchmark: ${reportPath}`);
  let baseline;
  for (const workers of [1, 2, 3, 4, 5, 6]) {
    console.log(`Starting ${workers} worker(s)`);
    const {summary, summaryPath} = await runSuite({workers, historyPath, outputDir: path.join(directory, `workers-${workers}`)});
    baseline ??= summary;
    const comparable = compareReports(baseline, summary)
      && JSON.stringify(baseline.jobs) === JSON.stringify(summary.jobs);
    report.results.push({workers, summaryPath, status: summary.status, comparable,
      durationMs: summary.durationMs, workMs: summary.workMs, workerMs: summary.workerMs,
      counts: summary.counts, resources: {...summary.resources, samples: undefined}});
    save();
    console.log(`Finished ${workers}: ${(summary.durationMs / 1000).toFixed(1)} s; comparable=${comparable}`);
    if (summary.status !== 'passed' || !comparable) process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  save();
  console.log(`Results: ${reportPath}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
