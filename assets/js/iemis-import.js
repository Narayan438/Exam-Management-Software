'use strict';

/* Student management and exact IEMIS Excel import. */
(function(){
  const COLUMN_KEY = 'student-visible-columns-v2';
  const DEFAULT_COLUMNS = ['photo','studentId','fullName','gender','currentClass','section'];
  const IEMIS_COLUMNS = [
    ['sn','S.N'],['studentId','Student Id'],['fullName','FullName'],['gender','Gender'],
    ['fatherName','Father Name'],['motherName','Mother Name'],['currentClass','CurrentClass'],
    ['section','Section'],['year','Year'],['permanentAddress','Permanent Address'],
    ['temporaryAddress','Temporary Address'],['dob','DOB'],['motherTongue','Mother Tongue'],
    ['disabilityType','Disability Type'],['age','Age'],['guardianName','Guardian Name'],
    ['guardianContact','Guardian Contact Number']
  ];
  const OPTIONAL_COLUMNS = [['photo','Photo']];
  const ALL_COLUMNS = [...OPTIONAL_COLUMNS,...IEMIS_COLUMNS];
  let importedRows = [];
  let sortState = {key:'fullName',direction:'asc'};
  let listMode = 'active';

  function norm(value){ return String(value ?? '').trim().toLowerCase(); }
  function text(value){
    if(value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
    return String(value ?? '').trim();
  }
  function ensureStudentState(){
    data.settings = data.settings || {};
    data.settings.academicYear = String(data.settings.academicYear || '2083');
    data.students = data.students || [];
    data.students.forEach(student=>{
      if(!student.status) student.status = 'active';
      if(!student.fullName) student.fullName = student.name || '';
      if(!student.studentId) student.studentId = student.iemisId || '';
      if(!student.dob) student.dob = student.dateOfBirth || '';
      if(!student.guardianName) student.guardianName = student.guardian || '';
      if(!student.guardianContact) student.guardianContact = student.contact || '';
      if(!student.year) student.year = student.academicYear || data.settings.academicYear;
    });
  }
  function selectedColumns(){
    try{
      const saved = JSON.parse(localStorage.getItem(COLUMN_KEY));
      return Array.isArray(saved) && saved.length ? saved.filter(key=>ALL_COLUMNS.some(([item])=>item===key)) : DEFAULT_COLUMNS;
    }catch(error){ return DEFAULT_COLUMNS; }
  }
  function saveColumns(columns){ localStorage.setItem(COLUMN_KEY,JSON.stringify(columns)); }
  function classFor(student){ return data.classes.find(item=>item.id===student.classId); }
  function sectionFor(student){ return data.sections.find(item=>item.id===student.sectionId); }
  function displayValue(student,key,index){
    const cl=classFor(student), sec=sectionFor(student);
    const values={
      sn:student.sn || index+1, studentId:student.studentId || student.iemisId,
      fullName:student.fullName || student.name, currentClass:student.currentClass || (cl&&cl.name),
      section:student.section || (sec&&sec.name), year:student.year || student.academicYear,
      guardianName:student.guardianName || student.guardian,
      guardianContact:student.guardianContact || student.contact
    };
    return values[key] ?? student[key] ?? '';
  }
  function compare(a,b,key){
    const av=text(displayValue(a,key,0)), bv=text(displayValue(b,key,0));
    const an=Number(av), bn=Number(bv);
    const result=av!=='' && bv!=='' && Number.isFinite(an) && Number.isFinite(bn)
      ? an-bn : av.localeCompare(bv,undefined,{numeric:true,sensitivity:'base'});
    return sortState.direction==='asc' ? result : -result;
  }
  function photoMarkup(student,large=false){
    const src=text(student.photo);
    const cls=large?'student-photo large':'student-photo';
    return src ? `<span class="${cls}"><img src="${escapeHtml(src)}" alt="${escapeHtml(student.fullName||student.name||'Student')}"></span>` : `<span class="${cls}" aria-label="No photo"></span>`;
  }
  function optionsForClass(selected=''){
    return data.classes.map(item=>`<option value="${item.id}" ${item.id===selected?'selected':''}>${escapeHtml(item.name)}</option>`).join('');
  }
  function sectionOptions(classId,selected=''){
    return data.sections.filter(item=>item.classId===classId).map(item=>`<option value="${item.id}" ${item.id===selected?'selected':''}>${escapeHtml(item.name)}</option>`).join('');
  }
  function studentPayload(source){
    return {
      id:source.id||uid(), sn:text(source.sn), studentId:text(source.studentId), fullName:text(source.fullName),
      name:text(source.fullName), gender:text(source.gender)||'Other', fatherName:text(source.fatherName),
      motherName:text(source.motherName), classId:source.classId||'', sectionId:source.sectionId||'',
      currentClass:text(source.currentClass), section:text(source.section), year:text(source.year)||data.settings.academicYear,
      academicYear:text(source.year)||data.settings.academicYear, permanentAddress:text(source.permanentAddress),
      temporaryAddress:text(source.temporaryAddress), dob:text(source.dob), motherTongue:text(source.motherTongue),
      disabilityType:text(source.disabilityType), age:text(source.age), guardianName:text(source.guardianName),
      guardian:text(source.guardianName), guardianContact:text(source.guardianContact), contact:text(source.guardianContact),
      photo:text(source.photo), status:source.status||'active', source:source.source||'Manual'
    };
  }
  function fileToDataUrl(file){
    return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file); });
  }

  renderStudents=function(c){
    ensureStudentState();
    const columns=selectedColumns();
    c.innerHTML=`<div class="panel-box student-panel">
      <div class="student-heading"><div><h3>Students</h3><div class="hint">Academic Year: <strong>${escapeHtml(data.settings.academicYear)}</strong> · Student records cannot be deleted.</div></div>
        <div class="student-header-actions"><button class="ghost" id="setAcademicYear">Set Academic Year</button><button class="primary" id="openIemis">⇧ Import from IEMIS</button></div></div>
      <section id="iemisImporter" class="iemis-importer hidden"></section>
      <details class="student-add-card"><summary>＋ Add student manually</summary><div id="studentForm"></div></details>
      <div class="student-list-tabs"><button data-mode="active" class="${listMode==='active'?'active':''}">Active Students</button><button data-mode="inactive" class="${listMode==='inactive'?'active':''}">Inactive / Vault</button></div>
      <div class="student-filter-bar">
        <label><span>Class</span><select id="stuFilterClass"><option value="__all">All classes</option>${optionsForClass()}</select></label>
        <label><span>Section</span><select id="stuFilterSection"><option value="__all">All sections</option></select></label>
        <label class="student-keyword"><span>Student</span><input type="search" id="stuFilterKeyword" placeholder="Name or Student Id"></label>
        <button class="student-search-btn" id="stuSearchBtn" type="button">Search</button>
        <details class="column-picker"><summary>Column Visibility</summary><div>${ALL_COLUMNS.map(([key,label])=>`<label><input type="checkbox" value="${key}" ${columns.includes(key)?'checked':''}> ${escapeHtml(label)}</label>`).join('')}</div></details>
      </div>
      <div class="table-scroll"><table class="data-table student-data-table"><thead id="stuHead"></thead><tbody id="stuBody"></tbody></table></div>
      <div class="empty-msg hidden" id="stuEmpty">No students found.</div>
      <div class="student-modal hidden" id="studentModal"><div class="student-modal-card"><button class="modal-close" type="button">×</button><div id="studentModalBody"></div></div></div>
    </div>`;
    renderManualForm();
    bindStudentEvents();
    refreshFilterSections();
    paintStudentTable();
  };

  function bindStudentEvents(){
    document.getElementById('setAcademicYear').onclick=async()=>{
      const next=prompt('Set the active academic year:',data.settings.academicYear);
      if(!next) return;
      if(!/^\d{4}$/.test(next.trim())){ alert('Enter a four-digit academic year, for example 2084.'); return; }
      data.settings.academicYear=next.trim(); await saveData(); renderStudents(document.getElementById('content'));
    };
    document.getElementById('openIemis').onclick=()=>{ const box=document.getElementById('iemisImporter'); box.classList.toggle('hidden'); if(!box.classList.contains('hidden')) renderImporter(box); };
    document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{ listMode=button.dataset.mode; renderStudents(document.getElementById('content')); });
    document.getElementById('stuFilterClass').onchange=refreshFilterSections;
    document.getElementById('stuSearchBtn').onclick=paintStudentTable;
    document.getElementById('stuFilterKeyword').onkeydown=event=>{ if(event.key==='Enter') paintStudentTable(); };
    document.querySelectorAll('.column-picker input').forEach(input=>input.onchange=()=>{
      const picked=[...document.querySelectorAll('.column-picker input:checked')].map(item=>item.value);
      if(!picked.length){ input.checked=true; return; }
      saveColumns(picked); paintStudentTable();
    });
    document.querySelector('#studentModal .modal-close').onclick=()=>document.getElementById('studentModal').classList.add('hidden');
  }
  function refreshFilterSections(){
    const classId=document.getElementById('stuFilterClass').value;
    const sections=classId==='__all'?data.sections:data.sections.filter(item=>item.classId===classId);
    document.getElementById('stuFilterSection').innerHTML='<option value="__all">All sections</option>'+sections.map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  }
  function renderManualForm(student=null){
    const host=document.getElementById('studentForm') || document.getElementById('studentModalBody');
    const record=student||{};
    const classId=record.classId || (data.classes[0]&&data.classes[0].id) || '';
    host.innerHTML=`<form class="student-form" id="studentEditForm">
      <label class="photo-input">${photoMarkup(record,true)}<span>Student Photo</span><input type="file" id="sfPhoto" accept="image/*"></label>
      <input id="sfStudentId" placeholder="Student Id" value="${escapeHtml(record.studentId||'')}">
      <input id="sfFullName" required placeholder="Full Name *" value="${escapeHtml(record.fullName||record.name||'')}">
      <select id="sfGender"><option>Male</option><option ${record.gender==='Female'?'selected':''}>Female</option><option ${record.gender==='Other'?'selected':''}>Other</option></select>
      <select id="sfClass">${optionsForClass(classId)}</select><select id="sfSection">${sectionOptions(classId,record.sectionId)}</select>
      <input id="sfDob" placeholder="DOB" value="${escapeHtml(record.dob||'')}"><input id="sfFather" placeholder="Father Name" value="${escapeHtml(record.fatherName||'')}">
      <input id="sfMother" placeholder="Mother Name" value="${escapeHtml(record.motherName||'')}"><input id="sfGuardian" placeholder="Guardian Name" value="${escapeHtml(record.guardianName||record.guardian||'')}">
      <input id="sfContact" placeholder="Guardian Contact Number" value="${escapeHtml(record.guardianContact||record.contact||'')}"><input id="sfPermanent" placeholder="Permanent Address" value="${escapeHtml(record.permanentAddress||'')}">
      <button class="primary" type="submit">${student?'Save changes':'Add student'}</button></form>`;
    document.getElementById('sfGender').value=record.gender||'Male';
    document.getElementById('sfClass').onchange=event=>{ document.getElementById('sfSection').innerHTML=sectionOptions(event.target.value); };
    document.getElementById('studentEditForm').onsubmit=async event=>{
      event.preventDefault();
      const file=document.getElementById('sfPhoto').files[0];
      const next=studentPayload({...record,
        studentId:document.getElementById('sfStudentId').value,fullName:document.getElementById('sfFullName').value,
        gender:document.getElementById('sfGender').value,classId:document.getElementById('sfClass').value,
        sectionId:document.getElementById('sfSection').value,dob:document.getElementById('sfDob').value,
        fatherName:document.getElementById('sfFather').value,motherName:document.getElementById('sfMother').value,
        guardianName:document.getElementById('sfGuardian').value,guardianContact:document.getElementById('sfContact').value,
        permanentAddress:document.getElementById('sfPermanent').value,photo:file?await fileToDataUrl(file):record.photo
      });
      if(next.studentId && data.students.some(item=>item.id!==next.id && text(item.studentId||item.iemisId)===next.studentId)){ alert('Student Id already exists.'); return; }
      const index=data.students.findIndex(item=>item.id===next.id);
      if(index>=0) data.students[index]=next; else data.students.push(next);
      await saveData(); renderStudents(document.getElementById('content'));
    };
  }
  function paintStudentTable(){
    const columns=selectedColumns();
    const labels=Object.fromEntries(ALL_COLUMNS);
    document.getElementById('stuHead').innerHTML='<tr>'+columns.map(key=>`<th><button class="sort-heading" data-sort="${key}">${escapeHtml(labels[key])}<span>${sortState.key===key?(sortState.direction==='asc'?'▲':'▼'):'↕'}</span></button></th>`).join('')+'<th>Action</th></tr>';
    document.querySelectorAll('[data-sort]').forEach(button=>button.onclick=()=>{ const key=button.dataset.sort; sortState={key,direction:sortState.key===key&&sortState.direction==='asc'?'desc':'asc'}; paintStudentTable(); });
    const classId=document.getElementById('stuFilterClass').value, sectionId=document.getElementById('stuFilterSection').value;
    const keyword=norm(document.getElementById('stuFilterKeyword').value);
    const list=data.students.filter(student=>{
      const status=student.status==='inactive'?'inactive':'active';
      return status===listMode && (classId==='__all'||student.classId===classId) && (sectionId==='__all'||student.sectionId===sectionId)
        && (!keyword||norm(student.fullName||student.name).includes(keyword)||norm(student.studentId||student.iemisId).includes(keyword));
    }).sort((a,b)=>compare(a,b,sortState.key));
    document.getElementById('stuEmpty').classList.toggle('hidden',!!list.length);
    document.getElementById('stuBody').innerHTML=list.map((student,index)=>`<tr>${columns.map(key=>`<td>${key==='photo'?photoMarkup(student):escapeHtml(displayValue(student,key,index)||'—')}</td>`).join('')}
      <td><details class="action-menu"><summary>Action</summary><div><button data-action="view" data-id="${student.id}">View</button><button data-action="edit" data-id="${student.id}">Edit</button>${listMode==='active'?`<button data-action="inactive" data-id="${student.id}">Not in school</button>`:`<button data-action="rejoin" data-id="${student.id}">Rejoin school</button>`}</div></details></td></tr>`).join('');
    document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>handleAction(button.dataset.action,button.dataset.id));
  }
  async function handleAction(action,id){
    const student=data.students.find(item=>item.id===id); if(!student) return;
    if(action==='inactive'){
      if(!confirm(`Move ${student.fullName||student.name} to Inactive / Vault?`)) return;
      student.status='inactive'; student.inactiveDate=new Date().toISOString(); await saveData(); paintStudentTable(); return;
    }
    if(action==='rejoin'){
      student.status='active'; student.rejoinedDate=new Date().toISOString(); student.year=data.settings.academicYear; student.academicYear=data.settings.academicYear; await saveData(); renderStudents(document.getElementById('content')); return;
    }
    const modal=document.getElementById('studentModal'), host=document.getElementById('studentModalBody'); modal.classList.remove('hidden');
    if(action==='edit'){ renderManualForm(student); return; }
    host.innerHTML=`<div class="student-profile">${photoMarkup(student,true)}<h3>${escapeHtml(student.fullName||student.name)}</h3>${IEMIS_COLUMNS.map(([key,label],index)=>`<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(displayValue(student,key,index)||'—')}</span></p>`).join('')}</div>`;
  }

  function findClass(value){ const key=norm(value).replace(/^(class|grade)\s*/, '').replace(/^0+/,''); return data.classes.find(item=>norm(item.name)===norm(value)||norm(item.name).replace(/^(class|grade)\s*/,'').replace(/^0+/,'')===key); }
  function ensureSection(classId,name){ let item=data.sections.find(sec=>sec.classId===classId&&norm(sec.name)===norm(name)); if(!item&&text(name)){ item={id:uid(),classId,name:text(name)}; data.sections.push(item); } return item?item.id:''; }
  function renderImporter(host){
    host.innerHTML=`<div class="iemis-import-header"><div><h3>IEMIS Student Import</h3><p>17 exact IEMIS headings are required. Photo is optional.</p></div><button class="ghost" id="closeIemis">Close</button></div>
      <div class="iemis-upload"><div><strong>Active Academic Year: ${escapeHtml(data.settings.academicYear)}</strong><small>Imported records will be assigned to this active year.</small></div><div class="iemis-upload-actions"><button class="ghost" id="iemisTemplate">Download template</button><label class="primary file-button">Choose Excel<input type="file" id="iemisFile" accept=".xlsx,.xls,.csv"></label></div></div><div id="iemisWorkspace" class="iemis-placeholder">Choose an IEMIS export file.</div>`;
    document.getElementById('closeIemis').onclick=()=>host.classList.add('hidden');
    document.getElementById('iemisTemplate').onclick=downloadTemplate;
    document.getElementById('iemisFile').onchange=event=>readIemis(event.target.files[0]);
  }
  async function readIemis(file){
    if(!file||typeof XLSX==='undefined'){ alert('Excel reader is unavailable.'); return; }
    try{
      const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:'',raw:false});
      const headers=rows.length?Object.keys(rows[0]):[];
      const required=IEMIS_COLUMNS.map(([,label])=>label), missing=required.filter(label=>!headers.includes(label));
      if(missing.length){ document.getElementById('iemisWorkspace').innerHTML=`<span class="import-status error">Invalid headings</span><p>Missing: ${escapeHtml(missing.join(', '))}</p>`; return; }
      importedRows=rows.map((row,index)=>{
        const source={}; IEMIS_COLUMNS.forEach(([key,label])=>source[key]=text(row[label])); source.photo=text(row.Photo); source.source='IEMIS Excel';
        const cl=findClass(source.currentClass); const errors=[];
        if(!source.studentId) errors.push('Student Id missing'); if(!source.fullName) errors.push('FullName missing'); if(!cl) errors.push('Class not found');
        if(data.students.some(item=>text(item.studentId||item.iemisId)===source.studentId)) errors.push('Duplicate Student Id');
        return {source,classItem:cl,errors,row:index+2};
      });
      const ready=importedRows.filter(item=>!item.errors.length);
      document.getElementById('iemisWorkspace').innerHTML=`<div class="iemis-summary"><span>${importedRows.length}<small>Total</small></span><span class="ready">${ready.length}<small>Ready</small></span><span class="invalid">${importedRows.length-ready.length}<small>Invalid</small></span></div><div class="iemis-preview-head"><div><strong>Import preview</strong><small>First 100 records</small></div><button class="primary" id="confirmIemis" ${ready.length?'':'disabled'}>Import ${ready.length}</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Status</th><th>Student Id</th><th>FullName</th><th>Class</th><th>Section</th><th>Photo</th></tr></thead><tbody>${importedRows.slice(0,100).map(item=>`<tr><td>${item.errors.length?`<span class="import-status error" title="${escapeHtml(item.errors.join(', '))}">Invalid</span>`:'<span class="import-status ready">Ready</span>'}</td><td>${escapeHtml(item.source.studentId)}</td><td>${escapeHtml(item.source.fullName)}</td><td>${escapeHtml(item.source.currentClass)}</td><td>${escapeHtml(item.source.section)}</td><td>${item.source.photo?'Yes':'—'}</td></tr>`).join('')}</tbody></table></div>`;
      document.getElementById('confirmIemis').onclick=confirmImport;
    }catch(error){ console.error(error); alert('Could not read the Excel file.'); }
  }
  async function confirmImport(){
    const ready=importedRows.filter(item=>!item.errors.length);
    ready.forEach(item=>{ item.source.classId=item.classItem.id; item.source.sectionId=ensureSection(item.classItem.id,item.source.section); item.source.year=data.settings.academicYear; data.students.push(studentPayload(item.source)); });
    await saveData(); alert(`${ready.length} students imported.`); importedRows=[]; renderStudents(document.getElementById('content'));
  }
  function downloadTemplate(){
    if(typeof XLSX==='undefined'){ alert('Excel reader is unavailable.'); return; }
    const row={}; IEMIS_COLUMNS.forEach(([,label])=>row[label]=''); row.Photo='';
    const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([row]),'Students'); XLSX.writeFile(book,'iemis-student-template.xlsx');
  }
})();
