'use strict';

/* Exact IEMIS Excel schema, import and configurable student table. */
(function(){
  const originalRenderStudents = renderStudents;
  let importRows = [];

  const COLUMNS = [
    {key:'sn', label:'S.N'},
    {key:'studentId', label:'Student Id'},
    {key:'fullName', label:'FullName'},
    {key:'gender', label:'Gender'},
    {key:'fatherName', label:'Father Name'},
    {key:'motherName', label:'Mother Name'},
    {key:'currentClass', label:'CurrentClass'},
    {key:'section', label:'Section'},
    {key:'year', label:'Year'},
    {key:'permanentAddress', label:'Permanent Address'},
    {key:'temporaryAddress', label:'Temporary Address'},
    {key:'dob', label:'DOB'},
    {key:'motherTongue', label:'Mother Tongue'},
    {key:'disabilityType', label:'Disability Type'},
    {key:'age', label:'Age'},
    {key:'guardianName', label:'Guardian Name'},
    {key:'guardianContactNumber', label:'Guardian Contact Number'}
  ];
  const EXACT_HEADERS = COLUMNS.map(column=>column.label);
  const DEFAULT_VISIBLE = ['sn','studentId','fullName','gender','currentClass','section','year'];
  const VISIBILITY_KEY = 'ems_student_columns_v1';

  function text(value){ return String(value ?? '').trim(); }
  function normal(value){ return text(value).toLowerCase().replace(/[_./()-]+/g,' ').replace(/\s+/g,' '); }
  function classKey(value){ return normal(value).replace(/^(grade|class|कक्षा)\s*/,'').replace(/^0+/,''); }
  function findClass(value){
    const key=classKey(value);
    return data.classes.find(item=>classKey(item.name)===key || normal(item.name)===normal(value));
  }
  function findSection(student){
    return data.sections.find(item=>item.id===student.sectionId);
  }
  function valueOf(value){
    if(value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
    return text(value);
  }
  function genderValue(value){
    const key=normal(value);
    if(['m','male','boy','पुरुष','छात्र'].includes(key)) return 'Male';
    if(['f','female','girl','महिला','छात्रा'].includes(key)) return 'Female';
    return text(value) || 'Other';
  }
  function ensureSection(classId,name){
    name=text(name);
    if(!name) return '';
    let section=data.sections.find(item=>item.classId===classId && normal(item.name)===normal(name));
    if(!section){
      section={id:uid(),classId,name};
      data.sections.push(section);
    }
    return section.id;
  }
  function visibleColumns(){
    try{
      const saved=JSON.parse(localStorage.getItem(VISIBILITY_KEY));
      const valid=Array.isArray(saved) ? saved.filter(key=>COLUMNS.some(column=>column.key===key)) : [];
      return valid.length ? valid : DEFAULT_VISIBLE.slice();
    }catch(_error){ return DEFAULT_VISIBLE.slice(); }
  }
  function saveVisible(keys){ localStorage.setItem(VISIBILITY_KEY,JSON.stringify(keys)); }

  function studentValue(student,key,index){
    const classItem=data.classes.find(item=>item.id===student.classId);
    const sectionItem=findSection(student);
    const values={
      sn: student.sn || index+1,
      studentId: student.studentId || student.iemisId || '',
      fullName: student.fullName || student.name || '',
      gender: student.gender || '',
      fatherName: student.fatherName || '',
      motherName: student.motherName || '',
      currentClass: student.currentClass || (classItem ? classItem.name : ''),
      section: student.section || (sectionItem ? sectionItem.name : ''),
      year: student.year || student.academicYear || '',
      permanentAddress: student.permanentAddress || '',
      temporaryAddress: student.temporaryAddress || '',
      dob: student.dob || '',
      motherTongue: student.motherTongue || '',
      disabilityType: student.disabilityType || '',
      age: student.age || '',
      guardianName: student.guardianName || student.guardian || '',
      guardianContactNumber: student.guardianContactNumber || student.contact || ''
    };
    return values[key] ?? '';
  }

  function filteredStudents(){
    const year=document.getElementById('stuFilterYear')?.value || '__all';
    const classId=document.getElementById('stuFilterClass')?.value || '__all';
    const sectionId=document.getElementById('stuFilterSection')?.value || '__all';
    const keyword=normal(document.getElementById('stuFilterKeyword')?.value);
    return data.students.filter((student,index)=>{
      const studentYear=text(studentValue(student,'year',index));
      const haystack=normal([studentValue(student,'studentId',index),studentValue(student,'fullName',index),student.roll].join(' '));
      return (year==='__all' || studentYear===year)
        && (classId==='__all' || student.classId===classId)
        && (sectionId==='__all' || student.sectionId===sectionId)
        && (!keyword || haystack.includes(keyword));
    });
  }

  function paintStudentTable(){
    const table=document.querySelector('#content table.data-table:not(.iemis-preview-table)');
    const empty=document.getElementById('stuEmpty');
    if(!table) return;
    const shown=visibleColumns();
    table.tHead.innerHTML='<tr>'+shown.map(key=>'<th>'+escapeHtml(COLUMNS.find(column=>column.key===key).label)+'</th>').join('')+'<th>Action</th></tr>';
    const tbody=table.tBodies[0];
    tbody.innerHTML='';
    const list=filteredStudents();
    if(empty) empty.classList.toggle('hidden',list.length>0);
    list.forEach((student,listIndex)=>{
      const originalIndex=data.students.indexOf(student);
      const row=document.createElement('tr');
      row.innerHTML=shown.map(key=>{
        const mono=['sn','studentId','year','dob','age','guardianContactNumber'].includes(key) ? ' class="mono"' : '';
        return '<td'+mono+'>'+escapeHtml(studentValue(student,key,originalIndex)||'—')+'</td>';
      }).join('')+'<td><button class="link-del" type="button" title="Delete student">&times;</button></td>';
      row.querySelector('.link-del').onclick=async()=>{
        if(!confirm('Delete this student record?')) return;
        data.students=data.students.filter(item=>item.id!==student.id);
        await saveData();
        paintStudentTable();
      };
      tbody.appendChild(row);
    });
  }

  function setupFilters(){
    const yearSelect=document.getElementById('stuFilterYear');
    if(yearSelect){
      const years=[...new Set(data.students.map((student,index)=>text(studentValue(student,'year',index))).filter(Boolean))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
      if(!years.length) years.push('2083');
      yearSelect.innerHTML='<option value="__all">All years</option>'+years.map(year=>'<option value="'+escapeHtml(year)+'">'+escapeHtml(year)+'</option>').join('');
    }
    const classSelect=document.getElementById('stuFilterClass');
    const sectionSelect=document.getElementById('stuFilterSection');
    function refreshSections(){
      const classId=classSelect?.value || '__all';
      const sections=classId==='__all' ? data.sections : data.sections.filter(section=>section.classId===classId);
      if(sectionSelect) sectionSelect.innerHTML='<option value="__all">All sections</option>'+sections.map(section=>'<option value="'+section.id+'">'+escapeHtml(section.name)+'</option>').join('');
    }
    if(classSelect) classSelect.onchange=refreshSections;
    refreshSections();
    document.getElementById('stuSearchBtn').onclick=paintStudentTable;
    document.getElementById('stuFilterKeyword').onkeydown=event=>{ if(event.key==='Enter') paintStudentTable(); };
  }

  function setupColumnVisibility(panel){
    const table=panel.querySelector('table.data-table');
    const toolbar=document.createElement('div');
    toolbar.className='student-table-toolbar';
    toolbar.innerHTML='<div><strong>Student List</strong><small id="studentResultCount"></small></div><div class="column-picker"><button class="ghost" id="columnPickerBtn" type="button">☷ Column Visibility</button><div class="column-picker-menu hidden" id="columnPickerMenu"></div></div>';
    table.parentNode.insertBefore(toolbar,table);
    const menu=toolbar.querySelector('#columnPickerMenu');
    const selected=visibleColumns();
    menu.innerHTML=COLUMNS.map(column=>'<label><input type="checkbox" value="'+column.key+'" '+(selected.includes(column.key)?'checked':'')+'> <span>'+escapeHtml(column.label)+'</span></label>').join('')
      +'<div class="column-picker-actions"><button type="button" id="defaultColumns">Default</button><button type="button" id="allColumns">Select all</button></div>';
    toolbar.querySelector('#columnPickerBtn').onclick=event=>{ event.stopPropagation(); menu.classList.toggle('hidden'); };
    menu.onclick=event=>event.stopPropagation();
    menu.querySelectorAll('input').forEach(input=>input.onchange=()=>{
      let keys=[...menu.querySelectorAll('input:checked')].map(item=>item.value);
      if(!keys.length){ input.checked=true; keys=[input.value]; }
      saveVisible(keys);
      paintStudentTable();
    });
    menu.querySelector('#defaultColumns').onclick=()=>{
      menu.querySelectorAll('input').forEach(input=>input.checked=DEFAULT_VISIBLE.includes(input.value));
      saveVisible(DEFAULT_VISIBLE);
      paintStudentTable();
    };
    menu.querySelector('#allColumns').onclick=()=>{
      const keys=COLUMNS.map(column=>column.key);
      menu.querySelectorAll('input').forEach(input=>input.checked=true);
      saveVisible(keys);
      paintStudentTable();
    };
    document.addEventListener('click',()=>menu.classList.add('hidden'),{once:true});
  }

  function validateHeaders(headers){
    const missing=EXACT_HEADERS.filter(header=>!headers.includes(header));
    const extra=headers.filter(header=>!EXACT_HEADERS.includes(header));
    return {missing,extra};
  }
  function parseRows(sourceRows){
    return sourceRows.map((source,index)=>{
      const row={};
      COLUMNS.forEach(column=>row[column.key]=valueOf(source[column.label]));
      row.sn=row.sn || index+1;
      row.gender=genderValue(row.gender);
      row.errors=[];
      if(!row.studentId) row.errors.push('Student Id missing');
      if(!row.fullName) row.errors.push('FullName missing');
      if(!row.currentClass) row.errors.push('CurrentClass missing');
      else if(!findClass(row.currentClass)) row.errors.push('Class not found');
      row.duplicate=!!(row.studentId && data.students.some((student,studentIndex)=>text(studentValue(student,'studentId',studentIndex))===row.studentId));
      return row;
    });
  }
  function paintPreview(){
    const host=document.getElementById('iemisWorkspace');
    if(!host) return;
    const ready=importRows.filter(row=>!row.errors.length&&!row.duplicate);
    const duplicates=importRows.filter(row=>!row.errors.length&&row.duplicate);
    const invalid=importRows.filter(row=>row.errors.length);
    host.innerHTML='<div class="iemis-summary"><span>'+importRows.length+'<small>Total rows</small></span><span class="ready">'+ready.length+'<small>Ready</small></span><span class="duplicate">'+duplicates.length+'<small>Duplicates</small></span><span class="invalid">'+invalid.length+'<small>Invalid</small></span></div>'
      +'<div class="iemis-preview-head"><div><strong>Review before import</strong><small>Exact IEMIS 17-column format · showing first '+Math.min(importRows.length,100)+' rows</small></div><button class="primary" id="confirmIemis" '+(ready.length?'':'disabled')+'>Import '+ready.length+' students</button></div>'
      +'<div class="table-scroll"><table class="data-table iemis-preview-table"><thead><tr><th>Status</th><th>Student Id</th><th>FullName</th><th>CurrentClass</th><th>Section</th><th>Year</th><th>Gender</th></tr></thead><tbody>'
      +importRows.slice(0,100).map(row=>'<tr><td>'+(row.errors.length?'<span class="import-status error" title="'+escapeHtml(row.errors.join(', '))+'">Invalid</span>':row.duplicate?'<span class="import-status duplicate">Duplicate</span>':'<span class="import-status ready">Ready</span>')+'</td><td class="mono">'+escapeHtml(row.studentId||'—')+'</td><td>'+escapeHtml(row.fullName||'—')+'</td><td>'+escapeHtml(row.currentClass||'—')+'</td><td>'+escapeHtml(row.section||'—')+'</td><td class="mono">'+escapeHtml(row.year||'—')+'</td><td>'+escapeHtml(row.gender||'—')+'</td></tr>').join('')
      +'</tbody></table></div>';
    document.getElementById('confirmIemis').onclick=async()=>{
      const students=importRows.filter(row=>!row.errors.length&&!row.duplicate);
      students.forEach(row=>{
        const classItem=findClass(row.currentClass);
        data.students.push({
          id:uid(),sn:row.sn,studentId:row.studentId,fullName:row.fullName,gender:row.gender,
          fatherName:row.fatherName,motherName:row.motherName,currentClass:row.currentClass,
          classId:classItem.id,section:row.section,sectionId:ensureSection(classItem.id,row.section),
          year:row.year,academicYear:row.year,permanentAddress:row.permanentAddress,
          temporaryAddress:row.temporaryAddress,dob:row.dob,motherTongue:row.motherTongue,
          disabilityType:row.disabilityType,age:row.age,guardianName:row.guardianName,
          guardianContactNumber:row.guardianContactNumber,source:'IEMIS Excel'
        });
      });
      await saveData();
      alert(students.length+' students imported successfully.');
      importRows=[];
      renderStudents(document.getElementById('content'));
    };
  }
  async function readFile(file){
    if(typeof XLSX==='undefined'){ alert('Excel reader did not load. Check the internet connection and reload.'); return; }
    if(!/\.(xlsx|xls|csv)$/i.test(file.name)){ alert('Choose an .xlsx, .xls or .csv file.'); return; }
    try{
      const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
      const sheet=book.Sheets[book.SheetNames[0]];
      const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
      if(matrix.length<2){ alert('No student rows were found in the first worksheet.'); return; }
      const headers=matrix[0].map(value=>text(value));
      const check=validateHeaders(headers);
      if(check.missing.length || check.extra.length){
        let message='The Excel headings do not match the IEMIS format.';
        if(check.missing.length) message+='\n\nMissing: '+check.missing.join(', ');
        if(check.extra.length) message+='\n\nUnexpected: '+check.extra.join(', ');
        alert(message);
        return;
      }
      const sourceRows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
      importRows=parseRows(sourceRows);
      paintPreview();
    }catch(error){
      console.error(error);
      alert('The file could not be read. Export it again from IEMIS and retry.');
    }
  }
  function downloadTemplate(){
    if(typeof XLSX==='undefined'){ alert('Excel reader did not load.'); return; }
    const blank={}; EXACT_HEADERS.forEach(header=>blank[header]='');
    const sheet=XLSX.utils.json_to_sheet([blank],{header:EXACT_HEADERS});
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,sheet,'Students');
    XLSX.writeFile(book,'iemis-student-import-template.xlsx');
  }

  function enhanceStudentPage(){
    const panel=document.querySelector('#content > .panel-box');
    if(!panel) return;
    const heading=panel.querySelector('h3');
    const hint=panel.querySelector('.hint');
    const header=document.createElement('div');
    header.className='student-heading';
    heading.parentNode.insertBefore(header,heading);
    header.append(heading,hint);
    header.insertAdjacentHTML('beforeend','<button class="primary" id="openIemis">⇧ Import from IEMIS</button>');
    header.insertAdjacentHTML('afterend','<section class="iemis-importer hidden" id="iemisImporter"><div class="iemis-import-header"><div><h3>IEMIS Student Import</h3><p>Uses the exact 17 headings from the official IEMIS Excel export.</p></div><button class="ghost" id="closeIemis">Close</button></div><div class="iemis-upload"><div><strong>Select IEMIS Excel file</strong><small>.xlsx, .xls or .csv · exact heading row required</small></div><div class="iemis-upload-actions"><button class="ghost" id="iemisTemplate">Download exact template</button><label class="primary file-button">Choose file<input type="file" id="iemisFile" accept=".xlsx,.xls,.csv"></label></div></div><div id="iemisWorkspace"><div class="iemis-placeholder">Choose a file to preview and validate all 17 columns.</div></div></section>');
    const importer=document.getElementById('iemisImporter');
    document.getElementById('openIemis').onclick=()=>{ importer.classList.remove('hidden'); if(importRows.length) paintPreview(); };
    document.getElementById('closeIemis').onclick=()=>importer.classList.add('hidden');
    document.getElementById('iemisTemplate').onclick=downloadTemplate;
    document.getElementById('iemisFile').onchange=event=>{ if(event.target.files[0]) readFile(event.target.files[0]); };

    setupFilters();
    const table=panel.querySelector('table.data-table');
    const scroll=document.createElement('div');
    scroll.className='table-scroll student-table-scroll';
    table.parentNode.insertBefore(scroll,table);
    scroll.appendChild(table);
    setupColumnVisibility(panel);
    paintStudentTable();
  }

  renderStudents=function(container){
    originalRenderStudents(container);
    enhanceStudentPage();
  };
})();