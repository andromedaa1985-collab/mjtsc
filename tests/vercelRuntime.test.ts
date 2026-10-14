import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';

test('compiled API imports JavaScript modules and starts without provider credentials', async () => {
  const root = process.cwd();
  const outputRoot = path.resolve(root, 'output');
  await mkdir(outputRoot, { recursive: true });
  const temporary = await mkdtemp(path.join(outputRoot, 'vercel-runtime-'));
  try {
    const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    for (const file of ['api/index.ts', 'server/app.ts', 'server/ai-api.ts', 'server/deepseek-provider.ts']) {
      const result = ts.transpileModule(await readFile(path.join(root, file), 'utf8'), {
        fileName: file, compilerOptions: { ...parsed.options, noEmit: false }, reportDiagnostics: true,
      });
      assert.equal(result.diagnostics?.filter(issue => issue.category === ts.DiagnosticCategory.Error).length, 0);
      const destination = path.join(temporary, file.replace(/\.ts$/, '.js'));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, result.outputText);
    }
    await copyFile(path.join(root, 'firebase-applet-config.json'), path.join(temporary, 'firebase-applet-config.json'));
    // Run emitted files in plain Node, without the test runner's TS resolver.
    await promisify(execFile)(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const { default: app } = await import(process.argv[1]);
      const server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      try {
        const origin = 'http://127.0.0.1:' + server.address().port;
        for (const route of ['deepseek', 'gemini']) {
          const response = await fetch(origin + '/api/' + route, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
          });
          assert.equal(response.status, 401);
          assert.equal((await response.json()).code, 'AUTH_REQUIRED');
        }
        const unknown = await fetch(origin + '/api/missing');
        assert.equal(unknown.status, 404);
        assert.equal((await unknown.json()).code, 'NOT_FOUND');
      } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    `, pathToFileURL(path.join(temporary, 'api/index.js')).href], { timeout: 15000 });
  } finally {
    assert.equal(path.dirname(temporary), outputRoot);
    await rm(temporary, { recursive: true, force: true });
  }
});
