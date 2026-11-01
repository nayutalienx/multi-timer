const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const handlers = {};
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    innerHTML: '', classList: { toggle() {} },
    addEventListener(type, fn) { handlers[`${id}:${type}`] = fn; },
    scrollIntoView() {},
  });
  return elements.get(id);
};
let stored;
let accepted = true;
const context = vm.createContext({
  console, Date, Intl, Map, Set, JSON, Math, Number, String, Array,
  localStorage: { getItem: () => null, setItem: (_, value) => { stored = value; } },
  document: {
    getElementById: element, querySelector: element,
    addEventListener(type, fn) { handlers[`document:${type}`] = fn; },
  },
  window: { addEventListener() {} }, navigator: { onLine: true },
  location: { protocol: 'http:' }, globalThis: {},
  setInterval() {}, setTimeout() {}, clearTimeout() {},
  confirm: () => accepted,
});
const code = readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInContext(code, context);
const run = code => vm.runInContext(code, context);
assert.equal(run('ui.group'), 'Общее');
assert.equal(run('groups().length'), 4);
assert(!element('content').innerHTML.includes('data-group="Все"'));
assert(element('content').innerHTML.includes('data-reset='));
assert(!element('content').innerHTML.includes('Открытое окно'));

function swipe(dx, dy = 0, target = null) {
  const touch = { identifier: 1, clientX: 200, clientY: 200 };
  handlers['content:touchstart']({ touches: [touch], target: { closest: () => target } });
  const end = { ...touch, clientX: 200 + dx, clientY: 200 + dy };
  handlers['content:touchmove']({ touches: [end] });
  handlers['content:touchend']({ changedTouches: [end], preventDefault() {} });
}
swipe(-100);
assert.equal(run('ui.group'), 'Воздух');
assert(element('content').innerHTML.includes('Открытое окно'));
swipe(100);
assert.equal(run('ui.group'), 'Общее');
swipe(100); // No wrap at the boundary.
swipe(-100, 80); // Vertical scrolling is not a group switch.
swipe(-100, 0, {}); // Tab strip keeps its native horizontal scrolling.
assert.equal(run('ui.group'), 'Общее');
run("ui.view='stats'");
swipe(-100);
assert.equal(run('ui.group'), 'Общее');
run("ui.view='timers';ui.modal=true");
swipe(-100);
assert.equal(run('ui.group'), 'Общее');
run('ui.modal=null');

const id = run('state.timers[0].id');
const clickReset = () => handlers['document:click']({
  target: {
    matches: () => false,
    closest: () => ({ dataset: { reset: id }, hasAttribute: () => false }),
  },
});
run('state.timers[0].segments=[[1000,4000]];state.timers[0].runningSince=Date.now()-5000;state.entries=[{marker:true,segments:[[1000,4000]]}]');
accepted = false;
clickReset();
assert.equal(run('state.timers[0].segments.length'), 1);
accepted = true;
clickReset();
assert.equal(run('state.timers[0].segments.length'), 0);
assert(run('state.timers[0].runningSince>=Date.now()-1000'));
assert.equal(run('state.entries[0].marker'), true);
assert.equal(JSON.parse(stored).entries[0].marker, true);
run('state.timers[0].runningSince=null;state.timers[0].segments=[[1000,4000]]');
clickReset();
assert.equal(run('state.timers[0].runningSince'), null);
assert.equal(run('state.timers[0].segments.length'), 0);

run("state.timers=state.timers.filter(t=>t.group!=='Общее');render()");
assert.equal(run('ui.group'), 'Воздух');
run('state.timers=[];render()');
assert.equal(run('ui.group'), null);
assert(element('content').innerHTML.includes('Пока нет таймеров'));
new vm.Script(readFileSync('sw.js', 'utf8'));
console.log('PASS: group filtering, swipes, boundaries, scroll/modal guards, reset, persistence, empty state, syntax');
