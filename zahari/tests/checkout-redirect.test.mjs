import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual middleware; stub only authentication and Cloudflare bindings.
const source = readFileSync(new URL('../src/middleware.ts', import.meta.url), 'utf8').replaceAll('import.meta.env.PROD', 'true');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(output, {
  exports, Response, Headers,
  require(name) {
    if (name === 'astro:middleware') return { defineMiddleware: fn => fn };
    if (name === './lib/auth') return { session: async () => null };
    if (name === './lib/runtime') return { bindings: {} };
    throw new Error(`Unexpected import: ${name}`);
  },
});
for (const target of ['https://checkout.stripe.com/c/pay/fixture', 'https://www.zahari.ink/pricing?checkout=pending', 'https://www.zahari.ink/signin']) {
  test(`checkout redirect survives response middleware: ${new URL(target).pathname}`, async () => {
    const result = await exports.onRequest({url: new URL('https://www.zahari.ink/api/billing/checkout'), locals: {}, cookies: {}}, async () => Response.redirect(target, 303));
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), target);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.match(result.headers.get('content-security-policy'), /form-action 'self' https:\/\/checkout\.stripe\.com/);
  });
}
test('an interrupted checkout reuses its open Stripe session without a second creation', async () => {
  const routeSource = readFileSync(new URL('../src/pages/api/billing/checkout.ts', import.meta.url), 'utf8');
  const routeExports = {};
  const calls = [];
  const bindings = {
    STRIPE_API_KEY: 'fixture-not-a-key',
    MODELS: { list: async () => ({objects: [{key: 'btc/fixture.glb'}]}) },
    DB: { prepare(sql) { return { bind() { return this; }, async first() {
      if (sql.includes('COUNT(*)')) return {assets: 8};
      if (sql.includes('FROM memberships')) return null;
      if (sql.startsWith('INSERT INTO checkout_attempts')) return null;
      if (sql.startsWith('SELECT session_id')) return {session_id: 'cs_fixture'};
      throw new Error(`Unexpected query: ${sql}`);
    } }; } },
  };
  vm.runInNewContext(ts.transpileModule(routeSource, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {
    exports: routeExports, Response, URLSearchParams,
    require(name) {
      if (name.endsWith('/runtime')) return {bindings};
      if (name.endsWith('/product')) return {ASSETS: ['BTC'], MODEL_COUNTS: {BTC: 1}};
      if (name.endsWith('/stripe')) return {PLANS: {one: {name: 'Zahari One Coin', cents: 499}}, stripe: async (path, form) => { calls.push({path, form}); return {status: 'open', url: 'https://checkout.stripe.com/c/pay/fixture'}; }};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const url = new URL('https://www.zahari.ink/api/billing/checkout');
  const response = await routeExports.POST({url, locals: {user: {id: 'fixture'}}, request: new Request(url, {method:'POST', headers:{Origin:url.origin, 'Content-Type':'application/x-www-form-urlencoded'}, body:'tier=one'})});
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://checkout.stripe.com/c/pay/fixture');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, 'checkout/sessions/cs_fixture');
  assert.equal(calls[0].form, undefined);
});
