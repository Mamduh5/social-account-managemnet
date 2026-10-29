import path from 'node:path';

const configured = process.env.SCC_DATA_DIR;
if (process.env.SCC_ISOLATED_TEST !== 'true' || !configured || !/test-runs/i.test(path.resolve(configured))) {
  throw new Error('This regression requires SCC_ISOLATED_TEST=true and a disposable SCC_DATA_DIR under test-runs. Use the isolated test runner.');
}
