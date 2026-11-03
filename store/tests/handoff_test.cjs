'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../extension/content.js'), 'utf8').replace(/\r\n/g, '\n');
function fixture() {
  const context = vm.createContext({ fpsLimit: () => 60, liteJank: false, liteHw: false, settings: { lite: 'auto' }, document: { visibilityState: 'visible' }, glows: new Map() });
  const g = { s: { adaptive: true }, fpsCap: 15, drawEma: 20, adaptAt: 0, away: () => false };
  for (const name of ['handoffState', 'adaptFps', 'jankStep']) {
    const match = source.match(new RegExp('    ' + name + '\\(([^)]*)\\) \\{\\n([\\s\\S]*?)\\n    \\}'));
    assert.ok(match, name);
    g[name] = vm.runInContext('(function(' + match[1] + '){' + match[2] + '\n})', context);
  }
  return { g, context };
}
test('return resets stale adaptive state, observes recovery grace and then resumes adaptation', () => {
  const { g } = fixture();
  g.handoffState(true, 1000);
  g.handoffState(false, 5000);
  assert.equal(g.fpsCap, 60);
  assert.equal(g.drawEma, 0);
  assert.equal(g.forceDraw, true);
  g.drawEma = 20;
  g.adaptFps(6500);
  assert.equal(g.fpsCap, 60);
  g.adaptFps(7100);
  assert.equal(g.fpsCap, 45);
});
test('foreign playback and recovery frames cannot enable persistent lite mode', () => {
  const { g, context } = fixture();
  g.away = () => true;
  for (let now = 1000; now < 10000; now += 100) g.jankStep(now, 100);
  assert.equal(vm.runInContext('liteJank', context), false);
  g.handoffState(true, 1000); g.handoffState(false, 10000); g.away = () => false;
  for (let now = 10000; now < 12000; now += 100) g.jankStep(now, 100);
  assert.equal(vm.runInContext('liteJank', context), false);
  for (let now = 12100; now < 17000; now += 100) g.jankStep(now, 100);
  assert.equal(vm.runInContext('liteJank', context), true);
});
