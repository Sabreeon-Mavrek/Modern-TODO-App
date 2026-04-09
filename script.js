/* ----------------- JS: robust app ----------------- */
const STORAGE_KEY = 'todoapp:design:v2';
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const id = ()=> (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2,8)));
const PRIORITIES = ['low','medium','high','urgent'];
const STATUS = ['backlog','in-progress','done'];


/* state */
const state = {
  tasks: [],
  prefs: { showCompleted:true, priorityFilter:'all', statusFilter:'all', projectFilter:'all', sortBy:'order', sortDir:'asc', groupBy:'none' },
  selected: new Set()
};

/* load */
(function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const d = JSON.parse(raw);
      state.tasks = Array.isArray(d.tasks)? d.tasks : [];
      Object.assign(state.prefs, d.prefs || {});
    }
  }catch(e){ console.warn('load failed', e); }
})();

/* persist */
function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, prefs: state.prefs })); }

/* utilities */
const now = ()=> Date.now();
const formatDate = ts => ts ? new Date(ts).toLocaleDateString() : '—';
const isToday = ts => ts && new Date(ts).toDateString() === new Date().toDateString();
const isOverdue = (ts, done) => ts && !done && ts < Date.now();
const debounce = (fn, ms=200)=>{ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };

/* project color mapping */
function projectClass(name){
  if(!name) return 'personal';
  const n = name.toLowerCase();
  if(n.includes('personal') || n.includes('home')) return 'personal';
  if(n.includes('work') || n.includes('office')) return 'work';
  if(n.includes('list') || n.includes('todo')) return 'list1';
  return 'neutral';
}

/* ordering helpers */
function bumpOrders(){ state.tasks = state.tasks.map((t,i)=> ({ ...t, order: i })); }
function reorderAll(){ state.tasks.sort((a,b)=> (a.order||0) - (b.order||0)); bumpOrders(); }

/* compute filtered list */
function computeFiltered(){
  let list = [...state.tasks];
  const q = ($('#search').value || '').trim().toLowerCase();
  if(q){
    list = list.filter(t => (t.title||'').toLowerCase().includes(q)
      || (t.notes||'').toLowerCase().includes(q)
      || (t.project||'').toLowerCase().includes(q)
      || (t.tags||[]).some(x=> ('#'+x).toLowerCase().includes(q))
    );
  }
  if(!state.prefs.showCompleted) list = list.filter(t=>!t.completed);
  if(state.prefs.priorityFilter !== 'all') list = list.filter(t => t.priority === state.prefs.priorityFilter);
  if(state.prefs.statusFilter !== 'all') list = list.filter(t => (t.status || 'backlog') === state.prefs.statusFilter);
  if(state.prefs.projectFilter !== 'all') list = list.filter(t => (t.project || 'Personal') === state.prefs.projectFilter);

  list.sort((a,b)=>{
    let c = 0;
    switch(state.prefs.sortBy){
      case 'title': c = (a.title||'').localeCompare(b.title||''); break;
      case 'priority': c = PRIORITIES.indexOf(a.priority||'medium') - PRIORITIES.indexOf(b.priority||'medium'); break;
      case 'due': c = (a.dueAt||0) - (b.dueAt||0); break;
      case 'created': c = (a.createdAt||0) - (b.createdAt||0); break;
      default: c = (a.order||0) - (b.order||0);
    }
    return state.prefs.sortDir === 'asc' ? c : -c;
  });

  return list;
}

/* groupify */
function groupify(list){
  if(state.prefs.groupBy === 'none') return { 'All': list };
  const map = {};
  list.forEach(t=>{
    let key = 'Other';
    if(state.prefs.groupBy === 'project') key = t.project || 'Personal';
    if(state.prefs.groupBy === 'priority') key = (t.priority || 'medium').toUpperCase();
    if(state.prefs.groupBy === 'status') key = (t.status || 'backlog').toUpperCase();
    if(state.prefs.groupBy === 'due'){
      if(!t.dueAt) key = 'No Date';
      else if(isToday(t.dueAt)) key = 'Today';
      else if(t.dueAt < Date.now()) key = 'Overdue';
      else key = 'Upcoming';
    }
    (map[key] = map[key] || []).push(t);
  });
  return map;
}

/* render */
const groupsEl = $('#groups');

function collectProjects(){
  return [...new Set(state.tasks.map(t => t.project || 'Personal'))].sort();
}
function collectTags(){
  const s = new Set(); state.tasks.forEach(t => (t.tags||[]).forEach(tag => s.add(tag))); return [...s];
}

function render(){
  // sidebar projects & tags
  const projects = collectProjects();
  const pf = $('#projectFilter');
  pf.innerHTML = '<option value="all">All</option>' + projects.map(p=>`<option>${p}</option>`).join('');
  pf.value = state.prefs.projectFilter;

  const tags = collectTags();
  const tagsCloud = $('#tagsCloud');
  tagsCloud.innerHTML = tags.length ? tags.map(t=>`<div class="tag tag-click" data-tag="${t}">#${t}</div>`).join('') : '<div class="mutedSmall">No tags yet</div>';
  $$('.tag-click').forEach(el => el.addEventListener('click', ()=> { $('#search').value = '#'+el.dataset.tag; render(); }));

  // stats
  const total = state.tasks.length;
  const completed = state.tasks.filter(t=>t.completed).length;
  const overdue = state.tasks.filter(t=> isOverdue(t.dueAt, t.completed) ).length;
  const today = state.tasks.filter(t=> isToday(t.dueAt) ).length;
  $('#statTotal').textContent = total;
  $('#statCompleted').textContent = completed;
  $('#statOverdue').textContent = overdue;
  $('#statToday').textContent = today;

  $('#bulkBox').style.display = state.selected.size ? 'block' : 'none';

  // groups
  groupsEl.innerHTML = '';
  const filtered = computeFiltered();
  const grouped = groupify(filtered);
  Object.entries(grouped).forEach(([name, items])=>{
    const section = document.createElement('section');
    const head = document.createElement('div'); head.className = 'groupHeader';
    const label = document.createElement('div'); label.style.fontWeight = 700; label.textContent = name;
    const count = document.createElement('div'); count.className = 'mutedSmall'; count.textContent = items.length;
    head.append(label, count);

    const cards = document.createElement('div'); cards.className = 'cards';
    items.forEach(t => cards.append(renderTask(t)));
    if(items.length === 0){
      const e = document.createElement('div'); e.className = 'card mutedSmall'; e.textContent = 'No tasks here yet.';
      cards.append(e);
    }
    section.append(head, cards);
    groupsEl.appendChild(section);
  });

  persist();
  wireDrag();
}

/* task element */
function renderTask(t){
  const tpl = $('#taskTpl').content.cloneNode(true);
  const node = tpl.querySelector('.task'); node.dataset.id = t.id;
  const sel = node.querySelector('.sel'); sel.checked = state.selected.has(t.id);
  sel.addEventListener('change', ()=>{ sel.checked ? state.selected.add(t.id) : state.selected.delete(t.id); render(); });

  const title = node.querySelector('.title'); title.value = t.title || ''; title.addEventListener('input', debounce(()=>{ t.title = title.value; persist(); }));
  const notes = node.querySelector('.notes'); notes.value = t.notes || ''; notes.addEventListener('input', debounce(()=>{ t.notes = notes.value; persist(); }));
  const del = node.querySelector('.del'); del.addEventListener('click', ()=>{ state.tasks = state.tasks.filter(x=>x.id !== t.id); state.selected.delete(t.id); reorderAll(); render(); });
  const pin = node.querySelector('.pin'); pin.addEventListener('click', ()=>{ t.pinned = !t.pinned; render(); });

  const projectPill = node.querySelector('.project'); projectPill.textContent = t.project || 'Personal';
  projectPill.className = 'pill project ' + projectClass(t.project);
  const duePill = node.querySelector('.due'); duePill.textContent = t.dueAt ? formatDate(t.dueAt) : 'No date';
  const statusPill = node.querySelector('.status'); statusPill.textContent = t.status || 'backlog';
  const prioPill = node.querySelector('.priority'); prioPill.textContent = t.priority || 'medium';

  node.querySelector('.meta').textContent = `Created: ${formatDate(t.createdAt || now())}${t.dueAt ? ' • Due: '+formatDate(t.dueAt) : ''}${ isOverdue(t.dueAt, t.completed) ? ' • Overdue' : '' }`;

  if(t.completed){
    node.style.opacity = 0.75;
    node.querySelector('.title').classList.add('strike');
  }

  // drag
  node.addEventListener('dragstart', e=>{
    if(!(state.prefs.sortBy === 'order' && state.prefs.groupBy === 'none')){
      e.preventDefault();
      toast('Reorder only with Sort: Custom and Group: None');
      return;
    }
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.effectAllowed = 'move';
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', ()=> node.classList.remove('dragging'));
  return node;
}

/* drag logic: robust placeholder approach */
function wireDrag(){
  // find all card containers (grids)
  $$('.cards').forEach(grid => {
    grid.ondragover = function(e){
      e.preventDefault();
      const dragId = e.dataTransfer.getData('text/plain');
      if(!dragId) return;
      let ph = grid.querySelector('.placeholder');
      if(!ph){
        ph = document.createElement('div');
        ph.className = 'placeholder';
        ph.textContent = 'Drop here';
      }
      // determine insertion point
      const after = getAfterElement(grid, e.clientY);
      if(after == null) grid.appendChild(ph);
      else grid.insertBefore(ph, after);
    };

    grid.ondrop = function(e){
      e.preventDefault();
      const fromId = e.dataTransfer.getData('text/plain');
      const ph = grid.querySelector('.placeholder');
      if(!ph) return;
      // compute new index relative to cards
      const beforeIds = Array.from(grid.children)
        .slice(0, Array.from(grid.children).indexOf(ph))
        .filter(c => c.classList && c.classList.contains('task'))
        .map(c => c.dataset.id);
      const toIndex = beforeIds.length;

      // grid visible ids (current)
      const visibleIds = Array.from(grid.querySelectorAll('.task')).map(c => c.dataset.id);
      // remove from visibleIds if present then insert at toIndex
      const newGridIds = visibleIds.filter(x => x !== fromId);
      newGridIds.splice(toIndex, 0, fromId);

      // Now rebuild new order for all visible items (top of list), rest follow
      const visibleAll = computeFiltered().map(t => t.id);
      // build newVisibleOrdered: start with grid ids, then any other visible ids not in grid
      const finalVisible = newGridIds.concat(visibleAll.filter(x => !newGridIds.includes(x)));
      const rest = state.tasks.filter(t => !finalVisible.includes(t.id)).map(t => t.id);
      const finalOrder = finalVisible.concat(rest);
      finalOrder.forEach((tid, i) => { const tt = state.tasks.find(x => x.id === tid); if(tt) tt.order = i; });
      reorderAll();

      ph.remove();
      render();
    };

    grid.ondragleave = function(e){
      
    };
  });
}

/* find element after which to insert placeholder */
function getAfterElement(container, y){
  const draggableElements = [...container.querySelectorAll('.task:not(.dragging)')];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  draggableElements.forEach(child => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    if(offset < 0 && offset > closest.offset){
      closest = { offset, element: child };
    }
  });
  return closest.element;
}

/* toast */
function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  t.className = 'card';
  t.style.position = 'fixed';
  t.style.bottom = '18px';
  t.style.left = '50%';
  t.style.transform = 'translateX(-50%)';
  t.style.zIndex = 9999;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 2000);
}

/* controls wiring */
$('#quickForm').addEventListener('submit', e=>{
  e.preventDefault();
  const title = ($('#qTitle').value || '').trim();
  if(!title) return;
  const t = { id: id(), title, notes:'', createdAt: Date.now(), dueAt: $('#qDue').value ? new Date($('#qDue').value).getTime() : null,
    priority: $('#qPriority').value, status: 'backlog', project: $('#qProject').value || 'Personal', tags: [], subtasks: [], completed:false, pinned:false, order: state.tasks.length };
  state.tasks.unshift(t);
  bumpOrders();
  $('#qTitle').value = '';
  render();
  $('#qTitle').focus();
});

$('#search').addEventListener('input', debounce(()=> render(), 120));
$('#clearSearch').addEventListener('click', ()=> { $('#search').value = ''; render(); $('#search').focus(); });

$('#showCompleted').addEventListener('change', e=> { state.prefs.showCompleted = e.target.checked; render(); });
$('#priorityFilter').addEventListener('change', e=> { state.prefs.priorityFilter = e.target.value; render(); });
$('#statusFilter').addEventListener('change', e=> { state.prefs.statusFilter = e.target.value; render(); });
$('#projectFilter').addEventListener('change', e=> { state.prefs.projectFilter = e.target.value; render(); });
$('#resetFilters').addEventListener('click', ()=> { state.prefs.priorityFilter='all'; state.prefs.statusFilter='all'; state.prefs.projectFilter='all'; state.prefs.showCompleted=true; render(); });

$('#bulkSelectVisible').addEventListener('click', ()=> { computeFiltered().forEach(t => state.selected.add(t.id)); render(); });
$('#bulkComplete').addEventListener('click', ()=> { state.tasks.forEach(t => { if(state.selected.has(t.id)){ t.completed = true; t.status = 'done'; } }); render(); });
$('#bulkDelete').addEventListener('click', ()=> { state.tasks = state.tasks.filter(t => !state.selected.has(t.id)); state.selected.clear(); reorderAll(); render(); });
$('#bulkPin').addEventListener('click', ()=> { state.tasks.forEach(t => { if(state.selected.has(t.id)) t.pinned = true; }); render(); });
$('#bulkUnpin').addEventListener('click', ()=> { state.tasks.forEach(t => { if(state.selected.has(t.id)) t.pinned = false; }); render(); });

$('#clearCompleted').addEventListener('click', ()=> {
  const before = state.tasks.length;
  state.tasks = state.tasks.filter(t => !t.completed);
  state.selected.clear();
  reorderAll();
  render();
  toast(`Removed ${before - state.tasks.length} completed`);
});

/* sort/group controls */
$('#sortBy').addEventListener ? $('#sortBy').addEventListener('change', e=> { state.prefs.sortBy = e.target.value; render(); }) : null;
$('#sortDir') && $('#sortDir').addEventListener('click', e=> { const dir = e.target.dataset.dir === 'asc' ? 'desc' : 'asc'; e.target.dataset.dir = dir; e.target.textContent = dir === 'asc' ? '⬇️' : '⬆️'; state.prefs.sortDir = dir; render(); });
$('#groupBy') && $('#groupBy').addEventListener('change', e=> { state.prefs.groupBy = e.target.value; render(); });

/* export/import */
$('#exportBtn').addEventListener('click', ()=> {
  const data = JSON.stringify({ exported: Date.now(), tasks: state.tasks }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'todo-export-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); a.remove(); URL.revokeObjectURL(url);
});
$('#importInput').addEventListener('change', e=>{
  const f = e.target.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = ()=> {
    try{
      const d = JSON.parse(r.result);
      if(Array.isArray(d.tasks)){
        state.tasks = d.tasks.map((t,i)=> ({ id: t.id || id(), title: t.title || 'Untitled', notes: t.notes || '', createdAt: t.createdAt || Date.now(), dueAt: t.dueAt || null, priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium', status: STATUS.includes(t.status) ? t.status : 'backlog', project: t.project || 'Imported', tags: Array.isArray(t.tags) ? t.tags : [], subtasks: Array.isArray(t.subtasks) ? t.subtasks : [], completed: !!t.completed, pinned: !!t.pinned, order: i }));
        reorderAll();
        render();
      } else alert('Invalid import file - tasks[] not found');
    } catch(err){ alert('Import failed: invalid JSON'); }
  };
  r.readAsText(f);
});

/* theme toggle simple */
$('#themeBtn').addEventListener('click', ()=> document.body.classList.toggle('dark') );

/* initial state & render */
if(!state.tasks.length){
  state.tasks.push(
    { id: id(), title: 'Buy groceries', notes: 'Milk, eggs, herbs', createdAt: Date.now()-86400000, dueAt: Date.now()+86400000, priority: 'medium', status: 'backlog', project: 'Personal', tags:['errand'], subtasks:[], completed:false, pinned:false, order:0 },
    { id: id(), title: 'Finish report', notes: 'Q2 numbers & slides', createdAt: Date.now()-7200000, dueAt: Date.now()+2*86400000, priority: 'high', status: 'in-progress', project: 'Work', tags:['report'], subtasks:[], completed:false, pinned:false, order:1 },
    { id: id(), title: 'Plan weekend list', notes: '', createdAt: Date.now()-3600000, dueAt: null, priority: 'low', status: 'backlog', project: 'List 1', tags:[], subtasks:[], completed:false, pinned:false, order:2 }
  );
  bumpOrders();
}


render();

