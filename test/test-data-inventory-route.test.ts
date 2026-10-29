import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';

test('inventory route rejects invalid filters and offers no mutation endpoint', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'scc-inventory-route-'));
  process.env.SCC_DATA_DIR = directory;
  const {db} = await import('../server/src/db/database.js');
  const {initializeDatabase} = await import('../server/src/db/schema.js');
  const {testDataInventoryRouter} = await import('../server/src/routes/test-data-inventory.routes.js');
  initializeDatabase();
  db.prepare("INSERT INTO categories(id,name,slug) VALUES ('cat','Category','category')").run();
  const before = db.serialize();
  const app = express();
  app.use(express.json());
  app.use('/api/test-data', testDataInventoryRouter);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/test-data`;
    for (const query of ['?limit=0', '?limit=51', '?offset=-1', '?offset=1.5', '?type=invalid', `?search=${'x'.repeat(201)}`]) {
      assert.equal((await fetch(base + query)).status, 400, query);
    }
    const response = await fetch(base + '?type=category&limit=1');
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).records[0].id, 'cat');
    for (const method of ['POST', 'DELETE', 'PATCH']) {
      assert.equal((await fetch(base, {method})).status, 404, method);
      assert.equal((await fetch(base + '/cat', {method})).status, 404, `${method} by ID`);
    }
    assert.deepEqual(db.serialize(), before);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
    rmSync(directory, {recursive:true,force:true,maxRetries:10,retryDelay:25});
  }
});
