const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const handlers = {};
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {
    innerHTML: '', classList: { toggle() {} },
    addEventListener(type, fn, options) { handlers[`${id}:${type}${options === true ? ':capture' : ''}`] = fn; },
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
assert(element('.brand b').innerHTML.includes('v1.6.0'));
assert.equal(run('timerStart({segments:[],runningSince:null})'), null);
assert.equal(run('timerStart({segments:[],runningSince:5000})'), 5000);
assert.equal(run('timerStart({segments:[[1000,2000]],runningSince:5000})'), 1000);
assert.equal(run('timerStart({segments:[[1000,2000]],runningSince:null})'), 1000);
assert.equal(run('timerStartLabel({segments:[],runningSince:null})'), 'Ещё не запускался');
assert.equal(run('groups().length'), 4);
assert(!element('content').innerHTML.includes('data-group="Все"'));
assert(element('content').innerHTML.includes('data-reset='));
assert(!element('content').innerHTML.includes('Открытое окно'));

function swipe(dx, dy = 0, target = null) {
  const touch = { identifier: 1, clientX: 200, clientY: 200 };
  handlers['content:touchstart']({ touches: [touch], target: { closest: selector => target === 'input' && selector.includes('input') ? {} : null } });
  const end = { ...touch, clientX: 200 + dx, clientY: 200 + dy };
  handlers['content:touchmove']({ touches: [end], cancelable: true, preventDefault() {} });
  handlers['content:touchend']({ changedTouches: [end], preventDefault() {} });
}
swipe(-100);
assert.equal(run('ui.group'), 'Воздух');
assert(element('content').innerHTML.includes('Открытое окно'));
swipe(100);
assert.equal(run('ui.group'), 'Общее');
swipe(100); // Wrap from the first to the last group.
assert.equal(run('ui.group'), 'Еда');
swipe(-100); // Wrap from the last to the first group.
assert.equal(run('ui.group'), 'Общее');
swipe(-60, 100); // Vertical scrolling is not a group switch.
swipe(-100, 0, 'input'); // Inputs ignore group gestures.
assert.equal(run('ui.group'), 'Общее');
swipe(-100, 40, 'tabs'); // Diagonal swipe on the group strip also works.
assert.equal(run('ui.group'), 'Воздух');
swipe(100, 40);
assert.equal(run('ui.group'), 'Общее');
let prevented = false;
let stopped = false;
handlers['content:click:capture']({ preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
assert(prevented && stopped); // A swipe starting on a button must not activate it.
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
run(`
 const stamp=(day,hour,minute=0)=>new Date(2026,10,day,hour,minute).getTime();
 const task={id:'a',name:'Работа',group:'Общее',color:'#ff9900'};
 state.timers=[{...task,runningSince:stamp(18,9),segments:[[stamp(17,23),stamp(18,1)]]}];
 state.entries=[
  {...task,timerId:'a',segments:[[stamp(17,22),stamp(17,23)]]},
  {...task,timerId:'a',segments:[[stamp(13,8),stamp(13,9)]]},
  {...task,timerId:'b',name:'Прогулка',segments:[[stamp(18,0,30),stamp(18,2)]]},
  {...task,timerId:'c',name:'Вручную',manualDay:'2026-11-18',manualMs:60000}
 ];
 ui.day='2026-11-18';ui.view='timeline';render();
`);
assert.equal(run(`timelineTracks(stamp(18,0),stamp(19,0),stamp(18,10)).map(t=>t.timer.name+':'+t.clips.length).join(',')`), 'Работа:2,Прогулка:1');
assert.equal(run(`timelineTracks(stamp(18,0),stamp(19,0),stamp(18,10))[0].clips[0].left`), run('stamp(18,0)'));
assert.equal(run(`timelineTracks(stamp(17,0),stamp(18,0),stamp(18,10))[0].clips[0].from`), run('stamp(17,22)'));
assert.equal(run(`timelineTracks(stamp(18,0),stamp(19,0),stamp(18,10))[0].clips[1].to`), null);
assert.equal(run(`timelineTracks(stamp(19,0),stamp(20,0),stamp(18,10)).length`), 0);
assert.equal(run(`currentBounds('week').from`), '2026-11-16');
assert.equal(run(`currentBounds('month').to`), '2026-11-30');
assert.equal(run(`(renderTimeline(stamp(19,10)).match(/class="timeline-mark"/g)||[]).length`), 24);
run(`timelinePeriod='week'`);
assert.equal(run(`(renderTimeline(stamp(19,10)).match(/class="timeline-mark"/g)||[]).length`), 7);
run(`timelinePeriod='month'`);
assert.equal(run(`(renderTimeline(stamp(19,10)).match(/class="timeline-mark"/g)||[]).length`), 30);
assert.equal(run(`ui.period`), 'day');
run(`hiddenTracks.add('a')`);
assert.equal(run(`(renderTimeline(stamp(19,10)).match(/class="timeline-row timeline-track"/g)||[]).length`), 1);
assert.match(run(`renderTimeline(stamp(19,10))`), /Дорожки · 1 из 2/);
run(`hiddenTracks.add('b')`);
assert.match(run(`renderTimeline(stamp(19,10))`), /Все дорожки скрыты/);
new vm.Script(readFileSync('sw.js', 'utf8'));
console.log('PASS: timer regressions and day/week/month timeline, midnight, ongoing and unsaved intervals');
