'use strict';

const STORAGE_KEY = 'school-mgmt-data';
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
    const res = await window.storage.get(STORAGE_KEY);
    data = res && res.value ? JSON.parse(res.value) : defaultData();
  }catch(e){ data = defaultData(); }
  if(!data.roles || !data.roles.length) data = defaultData();
  if(!data.staff) data.staff = [];
  data.roles.forEach(r=>{ if(r.permissions.staff===undefined) r.permissions.staff = !!r.locked; });
  await saveData();
}
async function saveData(){
  try{ await window.storage.set(STORAGE_KEY, JSON.stringify(data)); }catch(e){ console.error('save failed', e); }
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
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('whoName').textContent = session.name;
  document.getElementById('whoRole').textContent = session.role;
  buildNav();
  goPage(hasPerm('dashboard') ? 'dashboard' : firstAllowedPage());
}
document.getElementById('logoutBtn').addEventListener('click', ()=>{
  session = null;
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
  const totalStudents = data.students.length;
  const totalClasses = data.classes.length;
  const totalStaff = data.staff.length;
  const totalTeachers = data.staff.filter(s=>s.designation==='Teacher').length;
  const boys = data.students.filter(s=>s.gender==='Male').length;
  const girls = data.students.filter(s=>s.gender==='Female').length;

  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML = `
    <div class="stat-card"><div class="num">${totalStudents}</div><div class="label">Total Students</div></div>
    <div class="stat-card"><div class="num">${totalClasses}</div><div class="label">Classes</div></div>
    <div class="stat-card"><div class="num">${totalStaff}</div><div class="label">Total Staff</div></div>
    <div class="stat-card"><div class="num">${totalTeachers}</div><div class="label">Teachers</div></div>
    <div class="stat-card boys"><div class="num">${boys}</div><div class="label">Boys</div></div>
    <div class="stat-card girls"><div class="num">${girls}</div><div class="label">Girls</div></div>
  `;
  c.appendChild(grid);

  const box = document.createElement('div');
  box.className = 'panel-box';
  box.innerHTML = `<h3>Class-wise Enrolment</h3><div class="hint">Boys vs. girls per class.</div>
    <div class="legend"><span><i style="background:var(--boy)"></i>Boys</span><span><i style="background:var(--girl)"></i>Girls</span></div>
    <div class="chart-wrap" id="chartWrap"></div>`;
  c.appendChild(box);
  drawBarChart(document.getElementById('chartWrap'));
}

function drawBarChart(container){
  const classesSorted = [...data.classes].sort((a,b)=>a.order-b.order);
  const rows = classesSorted.map(cl=>{
    const stus = data.students.filter(s=>s.classId===cl.id);
    return { name: cl.name, boys: stus.filter(s=>s.gender==='Male').length, girls: stus.filter(s=>s.gender==='Female').length };
  });
  if(!rows.length || rows.every(r=>r.boys===0 && r.girls===0)){
    container.innerHTML = '<div class="empty-msg">No student data yet — add students to see the chart.</div>';
    return;
  }
  const maxVal = Math.max(1, ...rows.map(r=>Math.max(r.boys,r.girls)));
  const barW = 14, gap = 6, groupW = barW*2+gap, groupGap = 26;
  const chartH = 180, padTop = 10, padBottom = 34, padLeft = 36;
  const width = padLeft + rows.length*(groupW+groupGap) + 20;
  const height = padTop+chartH+padBottom;

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Mono, monospace">`;
  // gridlines
  for(let i=0;i<=4;i++){
    const y = padTop + chartH - (chartH*i/4);
    const val = Math.round(maxVal*i/4);
    svg += `<line x1="${padLeft}" y1="${y}" x2="${width-10}" y2="${y}" stroke="#ddd3b6" stroke-width="1"/>`;
    svg += `<text x="${padLeft-6}" y="${y+3}" font-size="9" fill="#55628a" text-anchor="end">${val}</text>`;
  }
  rows.forEach((r,i)=>{
    const gx = padLeft + i*(groupW+groupGap);
    const bh = (r.boys/maxVal)*chartH;
    const gh = (r.girls/maxVal)*chartH;
    svg += `<rect x="${gx}" y="${padTop+chartH-bh}" width="${barW}" height="${bh}" fill="#2b4c7e" rx="2"/>`;
    svg += `<rect x="${gx+barW+gap}" y="${padTop+chartH-gh}" width="${barW}" height="${gh}" fill="#b23a34" rx="2"/>`;
    svg += `<text x="${gx+groupW/2}" y="${padTop+chartH+16}" font-size="9.5" fill="#1B2A4A" text-anchor="middle">${escapeHtml(r.name).replace('Class ','C.')}</text>`;
  });
  svg += `</svg>`;
  container.innerHTML = svg;
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
    <div class="row-form" style="border-bottom:none; padding-bottom:0;">
      <select id="stuFilterClass"><option value="__all">All classes</option>${classOptions()}</select>
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
    data.students.push({id:uid(), name, roll, classId, sectionId, gender, dob, guardian, contact});
    saveData(); renderStudents(c);
  };

  document.getElementById('stuFilterClass').onchange = ()=> paintStudentTable();
  paintStudentTable();

  function paintStudentTable(){
    const tbody = document.getElementById('stuBody');
    tbody.innerHTML = '';
    const filterCls = document.getElementById('stuFilterClass').value;
    const list = data.students.filter(s=> filterCls==='__all' || s.classId===filterCls);
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
})();
