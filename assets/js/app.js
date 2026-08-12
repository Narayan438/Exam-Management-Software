'use strict';

const STORAGE_KEY = 'school-mgmt-data';
const SESSION_KEY = 'school-mgmt-session';
let data = null;
let session = null; // {id, username, name, role}
let currentPage = 'dashboard';

function uid(){ return Math.random().toString(36).slice(2,9); }
function escapeHtml(str){ return String(str??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function defaultData(){
  const classNames = ['Pre-Primary','Class 1','Class 2','Class 3','Class 4','Class 5','Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12'];
  const classes = classNames.map((n,i)=>({id: uid(), name:n, order:i+1}));
  const roles = [
    {id:uid(), name:'Admin', locked:true, permissions:{dashboard:true,students:true,staff:true,classes:true,sections:true,subjects:true,exams:true,roles:true,users:true}},
    {id:uid(), name:'Teacher', locked:false, permissions:{dashboard:true,students:true,staff:false,classes:false,sections:false,subjects:false,exams:true,roles:false,users:false}},
    {id:uid(), name:'Accountant', locked:false, permissions:{dashboard:true,students:true,staff:true,classes:false,sections:false,subjects:false,exams:false,roles:false,users:false}},
    {id:uid(), name:'Student', locked:false, permissions:{dashboard:true,students:false,staff:false,classes:false,sections:false,subjects:false,exams:false,roles:false,users:false}},
  ];
  const users = [{id:uid(), username:'admin', password:'admin123', name:'System Admin', role:'Admin'}];
  return { classes, sections:[], subjects:[], exams:[], roles, users, students:[], staff:[] };
}

async function loadData(){
  try{
    if(window.storage && typeof window.storage.get === 'function'){
      const res = await window.storage.get(STORAGE_KEY);
      data = res && res.value ? JSON.parse(res.value) : defaultData();
    }else{
      const saved = localStorage.getItem(STORAGE_KEY);
      data = saved ? JSON.parse(saved) : defaultData();
    }
  }catch(e){ data = defaultData(); }
  if(!data.roles || !data.roles.length) data = defaultData();
  if(!data.staff) data.staff = [];
  data.roles.forEach(r=>{ if(r.permissions.staff===undefined) r.permissions.staff = !!r.locked; });
  await saveData();
}
async function saveData(){
  try{
    const value = JSON.stringify(data);
    if(window.storage && typeof window.storage.set === 'function') await window.storage.set(STORAGE_KEY, value);
    else localStorage.setItem(STORAGE_KEY, value);
  }catch(e){ console.error('save failed', e); }
}

function roleByName(name){ return data.roles.find(r=>r.name===name); }
function hasPerm(key){
  if(!session) return false;
  const role = roleByName(session.role);
  return !!(role && role.permissions[key]);
}

/* ---------------- LOGIN ---------------- */
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

function saveSession(user){
  try{ sessionStorage.setItem(SESSION_KEY, JSON.stringify({id:user.id})); }
  catch(error){ console.warn('Session could not be persisted.', error); }
}
function clearSession(){
  try{ sessionStorage.removeItem(SESSION_KEY); }
  catch(error){ console.warn('Session could not be cleared.', error); }
}
function openAuthenticatedApp(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('whoName').textContent = session.name;
  document.getElementById('whoRole').textContent = session.role;
  buildNav();
  goPage(hasPerm(currentPage) ? currentPage : (hasPerm('dashboard') ? 'dashboard' : firstAllowedPage()));
}
function restoreSession(){
  try{
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    session = saved && saved.id ? data.users.find(user=>user.id===saved.id && user.active!==false) || null : null;
  }catch(error){
    session = null;
    clearSession();
  }
  if(session) openAuthenticatedApp();
}

function doLogin(){
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const match = data.users.find(x=>x.username===u && x.password===p);
  if(!match){
    document.getElementById('loginError').style.display='block';
    return;
  }
  document.getElementById('loginError').style.display='none';
  session = match;
  currentPage = hasPerm('dashboard') ? 'dashboard' : firstAllowedPage();
  saveSession(match);
  openAuthenticatedApp();
}
document.getElementById('logoutBtn').addEventListener('click', ()=>{
  session = null;
  clearSession();
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginUser').value=''; document.getElementById('loginPass').value='';
});

function firstAllowedPage(){
  const order = ['dashboard','students','staff','classes','sections','subjects','exams','roles','users'];
  return order.find(p=>hasPerm(p)) || 'dashboard';
}

function buildNav(){
  document.querySelectorAll('.nav-item').forEach(item=>{
    const perm = item.dataset.perm;
    item.style.display = hasPerm(perm) ? 'flex' : 'none';
    item.onclick = ()=> goPage(item.dataset.page);
  });
}

function goPage(page){
  if(!hasPerm(page)){ return; }
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(i=> i.classList.toggle('active', i.dataset.page===page));
  const titles = {dashboard:'Dashboard', students:'Students', staff:'Teachers & Staff', classes:'Classes', sections:'Sections', subjects:'Subjects', exams:'Exam Setting', roles:'Roles & Permissions', users:'Users / Logins'};
  document.getElementById('pageTitle').textContent = titles[page] || page;
  render();
}

/* ---------------- RENDER ROUTER ---------------- */
function render(){
  const c = document.getElementById('content');
  c.innerHTML = '';
  const renderers = {
    dashboard: renderDashboard, students: renderStudents, staff: renderStaff, classes: renderClasses,
    sections: renderSections, subjects: renderSubjects, exams: renderExams,
    roles: renderRoles, users: renderUsers
  };
  (renderers[currentPage] || renderDashboard)(c);
}

/* ---------------- DASHBOARD ---------------- */
function renderDashboard(c){
  const totalStudents = data.students.filter(student => student.status !== 'inactive').length;
  const totalStaff = data.staff.length;
  const totalUsers = data.users.length;
  const activeUsers = data.users.filter(user => user.active !== false).length;
  const presentToday = data.students.filter(student => student.status !== 'inactive' && student.attendanceToday === 'Present').length;
  const absentToday = data.students.filter(student => student.status !== 'inactive' && student.attendanceToday === 'Absent').length;

  c.innerHTML = `
    <div class="dashboard-layout">
      <section class="dashboard-main">
        <div class="overview-grid">
          ${dashboardStatCard('students', totalStudents, 'Student', 'blue')}
          ${dashboardStatCard('present', presentToday, 'Total Present', 'yellow')}
          ${dashboardStatCard('absent', absentToday, 'Total Absent', 'pink')}
          ${dashboardStatCard('staff', totalStaff, 'Staff', 'green')}
          ${dashboardStatCard('active', activeUsers, 'Active', 'mint')}
          ${dashboardStatCard('user', totalUsers, 'User', 'sky')}
        </div>

        <div class="distribution-card">
          <div class="distribution-heading">
            <h3>Student Distribution by Class</h3>
            <p>Click on bars to view detailed section breakdown</p>
          </div>
          <div class="dashboard-chart" id="chartWrap"></div>
        </div>
      </section>

      <aside class="dashboard-side">
  <section class="calendar-card" id="dashboardCalendar"></section>

  <section class="birthday-card">
    <div class="birthday-header">
      <h3>Birthday</h3>

      <div class="wish-controls">
        <input id="birthdayWish" type="text" aria-label="Birthday wish">
        <button type="button" id="wishBtn">▣&nbsp; Wish</button>
      </div>
    </div>

    <div class="birthday-tabs">
      <button class="active" data-birthday-tab="students">♧ Students</button>
      <button data-birthday-tab="staff">▣ Staff</button>
    </div>

    <div class="birthday-list" id="birthdayList"></div>
  </section>
</aside>
    </div>`;

  drawBarChart(document.getElementById('chartWrap'));
  renderBirthdayList('students');

  c.querySelectorAll('[data-birthday-tab]').forEach(button => {
    button.addEventListener('click', () => {
      c.querySelectorAll('[data-birthday-tab]').forEach(tab => tab.classList.remove('active'));
      button.classList.add('active');
      renderBirthdayList(button.dataset.birthdayTab);
    });
  });

  document.getElementById('wishBtn').addEventListener('click', () => {
    const message = document.getElementById('birthdayWish').value.trim();
    if(message) alert('Birthday wish ready: ' + message);
  });

  renderDashboardCalendar(document.getElementById('dashboardCalendar'));
}

function dashboardStatCard(icon, number, label, tone){
  const icons = {
    students:'<path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z"/><path d="M7 11v5l5 2.5 5-2.5v-5"/><path d="M21 9v6"/>',
    present:'<circle cx="12" cy="7" r="3"/><path d="M5.5 19c.5-4 2.8-6 6.5-6 1.2 0 2.3.2 3.2.7"/><path d="m16 18 2 2 4-5"/>',
    absent:'<circle cx="11" cy="7" r="3"/><path d="M4.5 19c.5-4 2.8-6 6.5-6 1.5 0 2.8.3 3.8.9"/><path d="m17 16 5 5m0-5-5 5"/>',
    staff:'<rect x="3" y="5" width="18" height="13" rx="2"/><circle cx="16" cy="12" r="2.5"/><path d="M12 18c.5-2.2 1.8-3.5 4-3.5s3.5 1.3 4 3.5"/>',
    active:'<circle cx="11" cy="8" r="3"/><path d="M4.5 20c.5-4.2 2.8-6.5 6.5-6.5"/><circle cx="18" cy="17" r="4"/><path d="M18 15v4m-2-2h4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7"/>'
  };
  return `<article class="overview-card ${tone}">
    <div class="overview-copy"><strong>${number}</strong><span>${label}</span></div>
    <div class="overview-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[icon]}</svg></div>
  </article>`;
}

function renderBirthdayList(type){
  const host = document.getElementById('birthdayList');
  if(!host) return;
  const today = new Date();
  const source = type === 'staff' ? data.staff : data.students;
  const birthdays = source.filter(person => {
    const raw = person.dob || person.dateOfBirth;
    if(!raw) return false;
    const parts = String(raw).split(/[-/]/).map(Number);
    return parts.length >= 3 && parts[1] === today.getMonth()+1 && parts[2] === today.getDate();
  });

  if(!birthdays.length){
    host.innerHTML = '<div class="birthday-empty">No birthdays today.</div>';
    return;
  }

  host.innerHTML = '<div class="birthday-today">Today</div>' + birthdays.map((person,index) => {
    const cl = data.classes.find(item => item.id === person.classId);
    const meta = type === 'staff'
      ? (person.designation || 'Staff')
      : [cl ? cl.name : '', person.roll ? 'Roll ' + person.roll : ''].filter(Boolean).join(' · ');
    return `<div class="birthday-person">
      <div class="birthday-avatar tone-${index%3}">${escapeHtml((person.name || '?').charAt(0).toUpperCase())}<span>♨</span></div>
      <div><strong>${escapeHtml(person.name || '—')}</strong><small>${escapeHtml(meta || 'Student')}</small></div>
    </div>`;
  }).join('');
}

function renderDashboardCalendar(host){
  let viewDate = new Date();
  viewDate.setDate(1);

  const paint = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const today = new Date();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const previousDays = new Date(year, month, 0).getDate();
    const monthName = viewDate.toLocaleString('en-US', {month:'long'});
    let cells = '';

    for(let index=0; index<42; index++){
      let day;
      let muted = false;
      if(index < firstDay){ day = previousDays-firstDay+index+1; muted=true; }
      else if(index >= firstDay+days){ day=index-firstDay-days+1; muted=true; }
      else day=index-firstDay+1;
      const isToday = !muted && day===today.getDate() && month===today.getMonth() && year===today.getFullYear();
      const sunday = index%7===0;
      cells += `<button class="calendar-day ${muted?'muted':''} ${isToday?'today':''} ${sunday?'holiday':''}">
        <span>${day}</span><small>${String((day+14)%32+1).padStart(2,'0')}</small>
      </button>`;
    }

    host.innerHTML = `
      <div class="calendar-toolbar">
        <div><strong>${monthName}</strong><span>${year}</span></div>
        <div class="calendar-actions">
          <button data-cal="prev" aria-label="Previous month">‹</button>
          <button data-cal="today" aria-label="Current month">⌖</button>
          <button data-cal="next" aria-label="Next month">›</button>
        </div>
      </div>
      <div class="calendar-week"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
      <div class="calendar-grid">${cells}</div>`;

    host.querySelector('[data-cal="prev"]').onclick=()=>{ viewDate.setMonth(viewDate.getMonth()-1); paint(); };
    host.querySelector('[data-cal="next"]').onclick=()=>{ viewDate.setMonth(viewDate.getMonth()+1); paint(); };
    host.querySelector('[data-cal="today"]').onclick=()=>{ viewDate=new Date(); viewDate.setDate(1); paint(); };
  };
  paint();
}

function drawBarChart(container){
  const classesSorted = [...data.classes].sort((a,b)=>a.order-b.order);
  const rows = classesSorted.map(cl=>({
    name:cl.name,
    total:data.students.filter(student=>student.classId===cl.id).length
  }));
  const maxVal = Math.max(10, ...rows.map(row=>row.total));
  const chartMax = Math.ceil(maxVal/10)*10;
  const chartH=300, top=24, bottom=112, left=54;
  const barW=34, gap=26;
  const width=Math.max(720,left+rows.length*(barW+gap)+30);
  const height=top+chartH+bottom;
  const colors=['#2176e8','#28bddd','#7350e9','#148c59','#08a4ed','#f1ad00'];

  let svg=`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Student distribution chart">`;
  for(let i=0;i<=4;i++){
    const y=top+chartH-(chartH*i/4);
    const value=Math.round(chartMax*i/4);
    svg+=`<line x1="${left}" y1="${y}" x2="${width-12}" y2="${y}" stroke="#e6ebf2"/><text x="${left-12}" y="${y+5}" text-anchor="end" class="axis-text">${value}</text>`;
  }
  svg+=`<text transform="translate(18 ${top+chartH/2}) rotate(-90)" text-anchor="middle" class="axis-title">Total Student</text>`;
  rows.forEach((row,index)=>{
    const x=left+18+index*(barW+gap);
    const barHeight=(row.total/chartMax)*chartH;
    const y=top+chartH-barHeight;
    svg+=`<g class="chart-bar" data-class="${escapeHtml(row.name)}"><title>${escapeHtml(row.name)}: ${row.total} students</title>
      <rect x="${x}" y="${y}" width="${barW}" height="${barHeight}" rx="6" fill="${colors[index%colors.length]}"/>
      <text x="${x+barW/2}" y="${Math.max(top+15,y-7)}" text-anchor="middle" class="bar-value">${row.total}</text>
      <text transform="translate(${x+barW/2} ${top+chartH+20}) rotate(-43)" text-anchor="end" class="class-label">${escapeHtml(row.name)}</text>
    </g>`;
  });
  svg+='</svg>';
  container.innerHTML=svg;
}

/* ---------------- CLASSES ---------------- */
function renderClasses(c){
  c.innerHTML = `<div class="panel-box">
    <h3>Classes</h3><div class="hint">Pre-Primary through Class 12 are pre-loaded — rename, reorder, add, or remove as needed.</div>
    <div class="row-form">
      <input type="text" id="clsName" placeholder="Class name">
      <input type="number" id="clsOrder" placeholder="Order">
      <button class="primary" id="clsAddBtn">Add class</button>
    </div>
    <table class="data-table"><thead><tr><th>#</th><th>Class</th><th>Sections</th><th>Students</th><th></th></tr></thead><tbody id="clsBody"></tbody></table>
    <div class="empty-msg hidden" id="clsEmpty">No classes yet.</div>
  </div>`;
  document.getElementById('clsAddBtn').onclick = ()=>{
    const name = document.getElementById('clsName').value.trim();
    const order = Number(document.getElementById('clsOrder').value) || (data.classes.length+1);
    if(!name) return;
    data.classes.push({id:uid(), name, order});
    saveData(); renderClasses(c);
  };
  const tbody = document.getElementById('clsBody');
  const sorted = [...data.classes].sort((a,b)=>a.order-b.order);
  document.getElementById('clsEmpty').classList.toggle('hidden', sorted.length>0);
  sorted.forEach(cl=>{
    const secCount = data.sections.filter(s=>s.classId===cl.id).length;
    const stuCount = data.students.filter(s=>s.classId===cl.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="mono">${cl.order}</td><td>${escapeHtml(cl.name)}</td><td class="mono">${secCount}</td><td class="mono">${stuCount}</td>
      <td><button class="link-del">&times;</button></td>`;
    tr.querySelector('.link-del').onclick = ()=>{
      data.classes = data.classes.filter(x=>x.id!==cl.id);
      data.sections = data.sections.filter(x=>x.classId!==cl.id);
      data.subjects = data.subjects.filter(x=>x.classId!==cl.id);
      saveData(); renderClasses(c);
    };
    tbody.appendChild(tr);
  });
}

/* ---------------- SECTIONS ---------------- */
function classOptions(selectedId){
  return [...data.classes].sort((a,b)=>a.order-b.order)
    .map(cl=>`<option value="${cl.id}" ${cl.id===selectedId?'selected':''}>${escapeHtml(cl.name)}</option>`).join('');
}
function renderSections(c){
  c.innerHTML = `<div class="panel-box">
    <h3>Sections</h3><div class="hint">Add sections (A, B, C...) within each class.</div>
    <div class="row-form">
      <select id="secClass">${classOptions()}</select>
      <input type="text" id="secName" placeholder="Section name">
      <button class="primary" id="secAddBtn">Add section</button>
    </div>
    <table class="data-table"><thead><tr><th>Class</th><th>Section</th><th>Students</th><th></th></tr></thead><tbody id="secBody"></tbody></table>
    <div class="empty-msg hidden" id="secEmpty">No sections yet.</div>
  </div>`;
  document.getElementById('secAddBtn').onclick = ()=>{
    const classId = document.getElementById('secClass').value;
    const name = document.getElementById('secName').value.trim();
    if(!classId || !name) return;
    data.sections.push({id:uid(), classId, name});
    saveData(); renderSections(c);
  };
  const tbody = document.getElementById('secBody');
  document.getElementById('secEmpty').classList.toggle('hidden', data.sections.length>0);
  data.sections.forEach(sec=>{
    const cl = data.classes.find(x=>x.id===sec.classId);
    const stuCount = data.students.filter(s=>s.sectionId===sec.id).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(cl?cl.name:'—')}</td><td>${escapeHtml(sec.name)}</td><td class="mono">${stuCount}</td>
      <td><button class="link-del">&times;</button></td>`;
    tr.querySelector('.link-del').onclick = ()=>{ data.sections = data.sections.filter(x=>x.id!==sec.id); saveData(); renderSections(c); };
    tbody.appendChild(tr);
  });
}

/* ---------------- SUBJECTS ---------------- */
function renderSubjects(c){
  c.innerHTML = `<div class="panel-box">
    <h3>Subjects</h3><div class="hint">Assign subjects to each class with max and pass marks.</div>
    <div class="row-form">
      <select id="subClass">${classOptions()}</select>
      <input type="text" id="subName" placeholder="Subject name">
      <input type="number" id="subMax" placeholder="Max" value="100">
      <input type="number" id="subPass" placeholder="Pass" value="33">
      <button class="primary" id="subAddBtn">Add subject</button>
    </div>
    <table class="data-table"><thead><tr><th>Class</th><th>Subject</th><th>Max</th><th>Pass</th><th></th></tr></thead><tbody id="subBody"></tbody></table>
    <div class="empty-msg hidden" id="subEmpty">No subjects yet.</div>
  </div>`;
  document.getElementById('subAddBtn').onclick = ()=>{
    const classId = document.getElementById('subClass').value;
    const name = document.getElementById('subName').value.trim();
    const max = Number(document.getElementById('subMax').value)||100;
    const pass = Number(document.getElementById('subPass').value)||33;
    if(!classId || !name) return;
    data.subjects.push({id:uid(), classId, name, max, pass});
    saveData(); renderSubjects(c);
  };
  const tbody = document.getElementById('subBody');
  document.getElementById('subEmpty').classList.toggle('hidden', data.subjects.length>0);
  data.subjects.forEach(sub=>{
    const cl = data.classes.find(x=>x.id===sub.classId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(cl?cl.name:'—')}</td><td>${escapeHtml(sub.name)}</td><td class="mono">${sub.max}</td><td class="mono">${sub.pass}</td>
      <td><button class="link-del">&times;</button></td>`;
    tr.querySelector('.link-del').onclick = ()=>{ data.subjects = data.subjects.filter(x=>x.id!==sub.id); saveData(); renderSubjects(c); };
    tbody.appendChild(tr);
  });
}

/* ---------------- EXAM SETTING ---------------- */
function renderExams(c){
  c.innerHTML = `<div class="panel-box">
    <h3>Exam Setting</h3><div class="hint">Define exam terms (First Term, Mid-Term, Final, etc.) for the year.</div>
    <div class="row-form">
      <input type="text" id="examName" placeholder="Exam name">
      <input type="text" id="examTerm" placeholder="Term / Semester">
      <input type="text" id="examDate" placeholder="Date (e.g. 2082/06/15)">
      <button class="primary" id="examAddBtn">Add exam</button>
    </div>
    <table class="data-table"><thead><tr><th>Exam</th><th>Term</th><th>Date</th><th></th></tr></thead><tbody id="examBody"></tbody></table>
    <div class="empty-msg hidden" id="examEmpty">No exams set up yet.</div>
  </div>`;
  document.getElementById('examAddBtn').onclick = ()=>{
    const name = document.getElementById('examName').value.trim();
    const term = document.getElementById('examTerm').value.trim();
    const dt = document.getElementById('examDate').value.trim();
    if(!name) return;
    data.exams.push({id:uid(), name, term, date:dt});
    saveData(); renderExams(c);
  };
  const tbody = document.getElementById('examBody');
  document.getElementById('examEmpty').classList.toggle('hidden', data.exams.length>0);
  data.exams.forEach(ex=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(ex.name)}</td><td>${escapeHtml(ex.term)}</td><td class="mono">${escapeHtml(ex.date)}</td>
      <td><button class="link-del">&times;</button></td>`;
    tr.querySelector('.link-del').onclick = ()=>{ data.exams = data.exams.filter(x=>x.id!==ex.id); saveData(); renderExams(c); };
    tbody.appendChild(tr);
  });
}

/* ---------------- ROLES & PERMISSIONS ---------------- */
const PERM_KEYS = [
  ['dashboard','Dashboard'],['students','Students'],['staff','Teachers & Staff'],['classes','Classes'],['sections','Sections'],
  ['subjects','Subjects'],['exams','Exam Setting'],['roles','Roles & Permissions'],['users','Users / Logins']
];
function renderRoles(c){
  c.innerHTML = `<div class="panel-box">
    <h3>Roles &amp; Permissions</h3><div class="hint">Control which menus each role can access. Admin always has full access.</div>
    <div class="row-form"><input type="text" id="roleName" placeholder="New role name"><button class="primary" id="roleAddBtn">Add role</button></div>
    <div id="rolesList"></div>
  </div>`;
  document.getElementById('roleAddBtn').onclick = ()=>{
    const name = document.getElementById('roleName').value.trim();
    if(!name) return;
    const perms = {}; PERM_KEYS.forEach(([k])=>perms[k]=false); perms.dashboard = true;
    data.roles.push({id:uid(), name, locked:false, permissions:perms});
    saveData(); renderRoles(c);
  };
  const list = document.getElementById('rolesList');
  data.roles.forEach(role=>{
    const box = document.createElement('div');
    box.className = 'panel-box';
    box.style.background = '#fffdf6';
    box.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <h3 style="margin:0; font-size:15px;">${escapeHtml(role.name)} ${role.locked?'<span class="badge" style="color:var(--gold)">locked</span>':''}</h3>
        ${role.locked?'':'<button class="link-del">&times;</button>'}
      </div>
      <div class="perm-grid">
        ${PERM_KEYS.map(([k,label])=>`
          <label><input type="checkbox" data-role="${role.id}" data-key="${k}" ${role.permissions[k]?'checked':''} ${role.locked?'disabled':''}> ${label}</label>
        `).join('')}
      </div>`;
    if(!role.locked){
      box.querySelector('.link-del').onclick = ()=>{
        data.roles = data.roles.filter(x=>x.id!==role.id);
        data.users.forEach(u=>{ if(u.role===role.name) u.role=''; });
        saveData(); renderRoles(c);
      };
    }
    box.querySelectorAll('input[type=checkbox]').forEach(chk=>{
      chk.onchange = ()=>{
        const r = data.roles.find(x=>x.id===chk.dataset.role);
        r.permissions[chk.dataset.key] = chk.checked;
        saveData();
      };
    });
    list.appendChild(box);
  });
}

/* ---------------- USERS / LOGINS ---------------- */
function renderUsers(c){
  c.innerHTML = `<div class="panel-box">
    <h3>Users / Logins</h3><div class="hint">Create login accounts for staff and assign a role to control their access.</div>
    <div class="row-form">
      <input type="text" id="usrName" placeholder="Full name">
      <input type="text" id="usrUsername" placeholder="Username">
      <input type="password" id="usrPassword" placeholder="Password">
      <select id="usrRole">${data.roles.map(r=>`<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`).join('')}</select>
      <button class="primary" id="usrAddBtn">Add user</button>
    </div>
    <table class="data-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th></th></tr></thead><tbody id="usrBody"></tbody></table>
  </div>`;
  document.getElementById('usrAddBtn').onclick = ()=>{
    const name = document.getElementById('usrName').value.trim();
    const username = document.getElementById('usrUsername').value.trim();
    const password = document.getElementById('usrPassword').value;
    const role = document.getElementById('usrRole').value;
    if(!name || !username || !password) return;
    if(data.users.some(u=>u.username===username)){ alert('Username already exists.'); return; }
    data.users.push({id:uid(), name, username, password, role});
    saveData(); renderUsers(c);
  };
  const tbody = document.getElementById('usrBody');
  data.users.forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(u.name)}</td><td class="mono">${escapeHtml(u.username)}</td><td>${escapeHtml(u.role||'—')}</td>
      <td>${u.username==='admin'?'':'<button class="link-del">&times;</button>'}</td>`;
    if(u.username!=='admin'){
      tr.querySelector('.link-del').onclick = ()=>{ data.users = data.users.filter(x=>x.id!==u.id); saveData(); renderUsers(c); };
    }
    tbody.appendChild(tr);
  });
}

/* ---------------- STUDENTS ---------------- */
function renderStudents(c){
  c.innerHTML = `<div class="panel-box">
    <h3>Students</h3><div class="hint">Full student record: class, section, gender, DOB, and guardian contact.</div>
    <div class="row-form">
      <input type="text" id="stuName" placeholder="Full name">
      <input type="text" id="stuRoll" placeholder="Roll no.">
      <select id="stuClass">${classOptions()}</select>
      <select id="stuSection"></select>
      <select id="stuGender"><option>Male</option><option>Female</option><option>Other</option></select>
      <input type="text" id="stuDob" placeholder="DOB (YYYY-MM-DD)">
      <input type="text" id="stuGuardian" placeholder="Guardian name">
      <input type="text" id="stuContact" placeholder="Contact no.">
      <button class="primary" id="stuAddBtn">Add student</button>
    </div>
    <div class="student-filter-bar">
      <label><span>Academic Year</span>
        <select id="stuFilterYear">
          <option value="2083">2083</option><option value="2082">2082</option><option value="2081">2081</option>
        </select>
      </label>
      <label><span>Class</span>
        <select id="stuFilterClass"><option value="__all">All classes</option>${classOptions()}</select>
      </label>
      <label><span>Section</span>
        <select id="stuFilterSection"><option value="__all">All sections</option></select>
      </label>
      <label class="student-keyword"><span>Student</span>
        <input type="search" id="stuFilterKeyword" placeholder="Name or roll no.">
      </label>
      <button class="student-search-btn" id="stuSearchBtn" type="button">Search</button>
    </div>
    <table class="data-table">
      <thead><tr><th>Roll</th><th>Name</th><th>Class</th><th>Section</th><th>Gender</th><th>DOB</th><th>Guardian</th><th>Contact</th><th></th></tr></thead>
      <tbody id="stuBody"></tbody>
    </table>
    <div class="empty-msg hidden" id="stuEmpty">No students yet.</div>
  </div>`;

  function refreshSectionOptions(){
    const classId = document.getElementById('stuClass').value;
    const opts = data.sections.filter(s=>s.classId===classId);
    document.getElementById('stuSection').innerHTML = opts.length
      ? opts.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
      : `<option value="">No sections</option>`;
  }
  document.getElementById('stuClass').onchange = refreshSectionOptions;
  refreshSectionOptions();

  document.getElementById('stuAddBtn').onclick = ()=>{
    const name = document.getElementById('stuName').value.trim();
    const roll = document.getElementById('stuRoll').value.trim();
    const classId = document.getElementById('stuClass').value;
    const sectionId = document.getElementById('stuSection').value;
    const gender = document.getElementById('stuGender').value;
    const dob = document.getElementById('stuDob').value.trim();
    const guardian = document.getElementById('stuGuardian').value.trim();
    const contact = document.getElementById('stuContact').value.trim();
    if(!name || !roll || !classId) return;
    data.students.push({id:uid(), name, roll, classId, sectionId, gender, dob, guardian, contact, academicYear:'2083'});
    saveData(); renderStudents(c);
  };

  function refreshFilterSections(){
    const classId = document.getElementById('stuFilterClass').value;
    const sections = classId === '__all' ? data.sections : data.sections.filter(s=>s.classId===classId);
    document.getElementById('stuFilterSection').innerHTML =
      `<option value="__all">All sections</option>` +
      sections.map(s=>{
        const cl = data.classes.find(x=>x.id===s.classId);
        const label = classId === '__all' && cl ? `${cl.name} - ${s.name}` : s.name;
        return `<option value="${s.id}">${escapeHtml(label)}</option>`;
      }).join('');
  }
  document.getElementById('stuFilterClass').onchange = refreshFilterSections;
  document.getElementById('stuSearchBtn').onclick = paintStudentTable;
  document.getElementById('stuFilterKeyword').onkeydown = event=>{
    if(event.key === 'Enter') paintStudentTable();
  };
  refreshFilterSections();
  paintStudentTable();

  function paintStudentTable(){
    const tbody = document.getElementById('stuBody');
    tbody.innerHTML = '';
    const filterYear = document.getElementById('stuFilterYear').value;
    const filterCls = document.getElementById('stuFilterClass').value;
    const filterSec = document.getElementById('stuFilterSection').value;
    const keyword = document.getElementById('stuFilterKeyword').value.trim().toLowerCase();
    const list = data.students.filter(s=>{
      const studentYear = String(s.academicYear || '2083');
      const matchesKeyword = !keyword || String(s.name||'').toLowerCase().includes(keyword) || String(s.roll||'').toLowerCase().includes(keyword);
      return studentYear === filterYear
        && (filterCls === '__all' || s.classId === filterCls)
        && (filterSec === '__all' || s.sectionId === filterSec)
        && matchesKeyword;
    });
    document.getElementById('stuEmpty').classList.toggle('hidden', list.length>0);
    list.forEach(s=>{
      const cl = data.classes.find(x=>x.id===s.classId);
      const sec = data.sections.find(x=>x.id===s.sectionId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="mono">${escapeHtml(s.roll)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(cl?cl.name:'—')}</td>
        <td>${escapeHtml(sec?sec.name:'—')}</td><td>${escapeHtml(s.gender||'—')}</td><td class="mono">${escapeHtml(s.dob||'—')}</td>
        <td>${escapeHtml(s.guardian||'—')}</td><td class="mono">${escapeHtml(s.contact||'—')}</td>
        <td><button class="link-del">&times;</button></td>`;
      tr.querySelector('.link-del').onclick = ()=>{ data.students = data.students.filter(x=>x.id!==s.id); saveData(); paintStudentTable(); };
      tbody.appendChild(tr);
    });
  }
}

/* ---------------- TEACHERS & STAFF ---------------- */
const DESIGNATIONS = ['Teacher','Principal','Vice Principal','Accountant','Librarian','Lab Assistant','Office Staff','Peon','Other'];
function renderStaff(c){
  c.innerHTML = `<div class="panel-box">
    <h3>Teachers &amp; Staff</h3><div class="hint">Add every staff member with a designation and a role. The role controls what they can access if you also create a login for them.</div>
    <div class="row-form">
      <input type="text" id="stfName" placeholder="Full name">
      <select id="stfDesignation">${DESIGNATIONS.map(d=>`<option>${d}</option>`).join('')}</select>
      <input type="text" id="stfContact" placeholder="Contact no.">
      <input type="text" id="stfEmail" placeholder="Email (optional)">
      <select id="stfClass"><option value="">Assigned class (optional)</option>${classOptions()}</select>
      <input type="text" id="stfSubject" placeholder="Subject taught (optional)">
      <select id="stfRole">${data.roles.map(r=>`<option value="${escapeHtml(r.name)}" ${r.name==='Teacher'?'selected':''}>${escapeHtml(r.name)}</option>`).join('')}</select>
    </div>
    <div class="row-form" style="border-bottom:none;">
      <label style="display:flex; align-items:center; gap:6px; font-size:12.5px;">
        <input type="checkbox" id="stfCreateLogin"> Also create a login for this staff member
      </label>
      <input type="text" id="stfUsername" placeholder="Username" style="display:none;">
      <input type="password" id="stfPassword" placeholder="Password" style="display:none;">
      <button class="primary" id="stfAddBtn">Add staff</button>
    </div>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Designation</th><th>Role</th><th>Contact</th><th>Class</th><th>Subject</th><th>Login</th><th></th></tr></thead>
      <tbody id="stfBody"></tbody>
    </table>
    <div class="empty-msg hidden" id="stfEmpty">No staff added yet.</div>
  </div>`;

  const createLoginChk = document.getElementById('stfCreateLogin');
  const usernameField = document.getElementById('stfUsername');
  const passwordField = document.getElementById('stfPassword');
  createLoginChk.onchange = ()=>{
    usernameField.style.display = createLoginChk.checked ? 'inline-block' : 'none';
    passwordField.style.display = createLoginChk.checked ? 'inline-block' : 'none';
  };

  document.getElementById('stfAddBtn').onclick = ()=>{
    const name = document.getElementById('stfName').value.trim();
    const designation = document.getElementById('stfDesignation').value;
    const contact = document.getElementById('stfContact').value.trim();
    const email = document.getElementById('stfEmail').value.trim();
    const classId = document.getElementById('stfClass').value;
    const subject = document.getElementById('stfSubject').value.trim();
    const role = document.getElementById('stfRole').value;
    if(!name) return;

    let loginUsername = '';
    if(createLoginChk.checked){
      const username = usernameField.value.trim();
      const password = passwordField.value;
      if(!username || !password){ alert('Enter a username and password to create a login, or untick the box.'); return; }
      if(data.users.some(u=>u.username===username)){ alert('Username already exists.'); return; }
      data.users.push({id:uid(), username, password, name, role});
      loginUsername = username;
    }
    data.staff.push({id:uid(), name, designation, contact, email, classId, subject, role, loginUsername});
    saveData(); renderStaff(c);
  };

  const tbody = document.getElementById('stfBody');
  document.getElementById('stfEmpty').classList.toggle('hidden', data.staff.length>0);
  data.staff.forEach(st=>{
    const cl = data.classes.find(x=>x.id===st.classId);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(st.name)}</td><td>${escapeHtml(st.designation)}</td>
      <td><span class="badge">${escapeHtml(st.role||'—')}</span></td><td class="mono">${escapeHtml(st.contact||'—')}</td>
      <td>${escapeHtml(cl?cl.name:'—')}</td><td>${escapeHtml(st.subject||'—')}</td>
      <td class="mono">${st.loginUsername?escapeHtml(st.loginUsername):'—'}</td>
      <td><button class="link-del">&times;</button></td>`;
    tr.querySelector('.link-del').onclick = ()=>{
      data.staff = data.staff.filter(x=>x.id!==st.id);
      if(st.loginUsername) data.users = data.users.filter(u=>u.username!==st.loginUsername);
      saveData(); renderStaff(c);
    };
    tbody.appendChild(tr);
  });
}

/* ---------------- INIT ---------------- */
(async function init(){
  await loadData();
  restoreSession();
})();
