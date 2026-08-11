'use strict';

/* IEMIS Excel import extension for the Students module. */
(function(){
  const originalRenderStudents = renderStudents;
  let importState = null;

  const fields = [
    {key:'iemisId',label:'IEMIS ID',aliases:['iemis id','iemisid','student id','studentid','emis id']},
    {key:'name',label:'Student Name *',aliases:['student name','studentname','name of student','full name','fullname','name']},
    {key:'roll',label:'Roll No.',aliases:['roll no','roll number','rollno','roll']},
    {key:'className',label:'Class *',aliases:['class','grade','student class','current class']},
    {key:'sectionName',label:'Section',aliases:['section','sec']},
    {key:'gender',label:'Gender',aliases:['gender','sex']},
    {key:'dob',label:'Date of Birth',aliases:['date of birth','dateofbirth','dob','birth date']},
    {key:'guardian',label:'Guardian Name',aliases:['guardian name','guardian','father name','mother name','parent name']},
    {key:'contact',label:'Contact No.',aliases:['contact no','contact number','mobile no','mobile number','phone','guardian mobile']}
  ];

  function normal(value){
    return String(value ?? '').trim().toLowerCase().replace(/[_./()-]+/g,' ').replace(/\s+/g,' ');
  }
  function valueOf(value){
    if(value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
    return String(value ?? '').trim();
  }
  function classKey(value){
    return normal(value).replace(/^(grade|class|कक्षा)\s*/,'').replace(/^0+/, '');
  }
  function findClass(value){
    const key=classKey(value);
    return data.classes.find(item=>classKey(item.name)===key || normal(item.name)===normal(value));
  }
  function detect(headers){
    const mapping={};
    fields.forEach(field=>{
      mapping[field.key]=headers.find(header=>field.aliases.includes(normal(header))) || '';
    });
    return mapping;
  }
  function gender(value){
    const key=normal(value);
    if(['m','male','boy','पुरुष','छात्र'].includes(key)) return 'Male';
    if(['f','female','girl','महिला','छात्रा'].includes(key)) return 'Female';
    return key ? 'Other' : '';
  }
  function isDuplicate(row){
    if(row.iemisId && data.students.some(item=>valueOf(item.iemisId)===row.iemisId)) return true;
    const classItem=findClass(row.className);
    return !!(row.name && classItem && data.students.some(item=>
      normal(item.name)===normal(row.name) && item.classId===classItem.id &&
      (!row.roll || normal(item.roll)===normal(row.roll))
    ));
  }
  function mappedRows(){
    if(!importState) return [];
    return importState.rows.map((source,index)=>{
      const row={sourceRow:index+2};
      fields.forEach(field=>{ row[field.key]=valueOf(source[importState.mapping[field.key]]); });
      row.gender=gender(row.gender);
      row.errors=[];
      if(!row.name) row.errors.push('Student name missing');
      if(!row.className) row.errors.push('Class missing');
      else if(!findClass(row.className)) row.errors.push('Class not found');
      row.duplicate=isDuplicate(row);
      return row;
    });
  }
  function ensureSection(classId,name){
    name=valueOf(name);
    if(!name) return '';
    let section=data.sections.find(item=>item.classId===classId && normal(item.name)===normal(name));
    if(!section){
      section={id:uid(),classId,name};
      data.sections.push(section);
    }
    return section.id;
  }
  function selectHtml(field){
    return `<label><span>${escapeHtml(field.label)}</span><select data-map="${field.key}">
      <option value="">— Not mapped —</option>
      ${importState.headers.map(header=>`<option value="${escapeHtml(header)}" ${header===importState.mapping[field.key]?'selected':''}>${escapeHtml(header)}</option>`).join('')}
    </select></label>`;
  }
  function paintPreview(){
    const host=document.getElementById('iemisWorkspace');
    if(!host || !importState) return;
    const rows=mappedRows();
    const ready=rows.filter(row=>!row.errors.length && !row.duplicate);
    const duplicates=rows.filter(row=>!row.errors.length && row.duplicate);
    const invalid=rows.filter(row=>row.errors.length);
    host.innerHTML=`
      <div class="iemis-step">
        <div class="iemis-step-title"><strong>2. Match Excel columns</strong><span>Required: Student Name and Class</span></div>
        <div class="iemis-mapping">${fields.map(selectHtml).join('')}</div>
      </div>
      <div class="iemis-summary">
        <span>${rows.length}<small>Total rows</small></span>
        <span class="ready">${ready.length}<small>Ready</small></span>
        <span class="duplicate">${duplicates.length}<small>Duplicates</small></span>
        <span class="invalid">${invalid.length}<small>Invalid</small></span>
      </div>
      <div class="iemis-preview-head">
        <div><strong>3. Review before import</strong><small>Showing first ${Math.min(rows.length,100)} rows</small></div>
        <button class="primary" id="confirmIemis" ${ready.length?'':'disabled'}>Import ${ready.length} students</button>
      </div>
      <div class="table-scroll"><table class="data-table iemis-preview-table">
        <thead><tr><th>Status</th><th>IEMIS ID</th><th>Name</th><th>Roll</th><th>Class</th><th>Section</th><th>Gender</th><th>DOB</th></tr></thead>
        <tbody>${rows.slice(0,100).map(row=>`<tr>
          <td>${row.errors.length?`<span class="import-status error" title="${escapeHtml(row.errors.join(', '))}">Invalid</span>`:row.duplicate?'<span class="import-status duplicate">Duplicate</span>':'<span class="import-status ready">Ready</span>'}</td>
          <td class="mono">${escapeHtml(row.iemisId||'—')}</td><td>${escapeHtml(row.name||'—')}</td><td>${escapeHtml(row.roll||'—')}</td>
          <td>${escapeHtml(row.className||'—')}</td><td>${escapeHtml(row.sectionName||'—')}</td><td>${escapeHtml(row.gender||'—')}</td><td>${escapeHtml(row.dob||'—')}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;

    host.querySelectorAll('[data-map]').forEach(select=>select.onchange=()=>{
      importState.mapping[select.dataset.map]=select.value;
      paintPreview();
    });
    document.getElementById('confirmIemis').onclick=async()=>{
      const students=mappedRows().filter(row=>!row.errors.length && !row.duplicate);
      students.forEach(row=>{
        const classItem=findClass(row.className);
        data.students.push({
          id:uid(),iemisId:row.iemisId,name:row.name,roll:row.roll,classId:classItem.id,
          sectionId:ensureSection(classItem.id,row.sectionName),gender:row.gender||'Other',dob:row.dob,
          guardian:row.guardian,contact:row.contact,source:'IEMIS Excel'
        });
      });
      await saveData();
      alert(`${students.length} students imported successfully.`);
      importState=null;
      renderStudents(document.getElementById('content'));
    };
  }
  async function readFile(file){
    if(typeof XLSX==='undefined'){ alert('Excel reader did not load. Check the internet connection and reload.'); return; }
    if(!/\.(xlsx|xls|csv)$/i.test(file.name)){ alert('Choose an .xlsx, .xls or .csv file.'); return; }
    try{
      const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      const sheet=book.Sheets[book.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
      if(!rows.length){ alert('No student rows were found in the first worksheet.'); return; }
      const headers=Object.keys(rows.reduce((all,row)=>Object.assign(all,row),{}));
      importState={rows,headers,mapping:detect(headers),fileName:file.name};
      paintPreview();
    }catch(error){
      console.error(error);
      alert('The file could not be read. Export it again from IEMIS and retry.');
    }
  }
  function downloadTemplate(){
    if(typeof XLSX==='undefined'){ alert('Excel reader did not load.'); return; }
    const sample=[{'IEMIS ID':'','Student Name':'','Roll No.':'','Class':'Class 1','Section':'A','Gender':'Male','Date of Birth':'','Guardian Name':'','Contact No.':''}];
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(sample),'Students');
    XLSX.writeFile(book,'iemis-student-import-template.xlsx');
  }
  function enhanceStudentPage(){
    const panel=document.querySelector('#content > .panel-box');
    if(!panel || document.getElementById('iemisImporter')) return;
    const heading=panel.querySelector('h3');
    const hint=panel.querySelector('.hint');
    const header=document.createElement('div');
    header.className='student-heading';
    heading.parentNode.insertBefore(header,heading);
    header.append(heading,hint);
    header.insertAdjacentHTML('beforeend','<button class="primary" id="openIemis">⇧ Import from IEMIS</button>');
    header.insertAdjacentHTML('afterend',`<section class="iemis-importer hidden" id="iemisImporter">
      <div class="iemis-import-header"><div><h3>IEMIS Student Import</h3><p>Upload → match columns → preview → confirm. Nothing changes before confirmation.</p></div><button class="ghost" id="closeIemis">Close</button></div>
      <div class="iemis-upload"><div><strong>1. Select IEMIS Excel file</strong><small>.xlsx, .xls or .csv · first worksheet is used</small></div>
        <div class="iemis-upload-actions"><button class="ghost" id="iemisTemplate">Download sample</button><label class="primary file-button">Choose file<input type="file" id="iemisFile" accept=".xlsx,.xls,.csv"></label></div>
      </div><div id="iemisWorkspace"><div class="iemis-placeholder">Choose a file to begin.</div></div>
    </section>`);
    const importer=document.getElementById('iemisImporter');
    document.getElementById('openIemis').onclick=()=>{ importer.classList.remove('hidden'); if(importState) paintPreview(); };
    document.getElementById('closeIemis').onclick=()=>importer.classList.add('hidden');
    document.getElementById('iemisTemplate').onclick=downloadTemplate;
    document.getElementById('iemisFile').onchange=event=>{ if(event.target.files[0]) readFile(event.target.files[0]); };

    const table=panel.querySelector('.data-table');
    table.parentNode.insertBefore(Object.assign(document.createElement('div'),{className:'table-scroll'}),table).appendChild(table);
    table.querySelector('thead tr').insertAdjacentHTML('afterbegin','<th>IEMIS ID</th>');
    data.students.forEach((student,index)=>{
      const row=table.tBodies[0].rows[index];
      if(row) row.insertAdjacentHTML('afterbegin',`<td class="mono">${escapeHtml(student.iemisId||'—')}</td>`);
    });
  }

  renderStudents=function(container){
    originalRenderStudents(container);
    enhanceStudentPage();
  };
})();
