import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import './students.css';

const idOf=v=>v?._id||v||'';
const errText=e=>e?.response?.data?.error||e?.message||'Request failed';
const periodLabel=p=>p?.academicType==='college'?'Part':p?.academicSystem==='semester'||p?.academicType==='university'?'Semester':'Year';
const periodNo=s=>Number(s?.currentPeriod||s?.currentSemester||1);
const money=n=>Number(n||0).toLocaleString();
const sectionGenderLabel=v=>v==='boys'?'Boys':v==='girls'?'Girls':v==='both'?'Both':'—';

export default function Students(){
  const location=useLocation(),navigate=useNavigate();
  const requested=new URLSearchParams(location.search).get('tab')||'list';
  const validTabs=['list','sections','change-class','suspend','promotion','reports'];
  const [tab,setTabState]=useState(requested==='progress'?'reports':validTabs.includes(requested)?requested:'list');
  const [rows,setRows]=useState([]),[sections,setSections]=useState([]),[sessions,setSessions]=useState([]),[programs,setPrograms]=useState([]),[teachers,setTeachers]=useState([]);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [filters,setFilters]=useState({sessionId:'',programId:'',sectionId:'',q:''});
  const [detail,setDetail]=useState(null),[detailForm,setDetailForm]=useState({});
  const [listPage,setListPage]=useState(1),[sectionsPage,setSectionsPage]=useState(1),[promotionPage,setPromotionPage]=useState(1);
  const PAGE_SIZE=25;
  const [sectionForm,setSectionForm]=useState({programId:'',academicSessionId:'',periodNumber:'1',genderType:'boys',name:'',capacity:50,classTeacherId:''});
  const [allocation,setAllocation]=useState({programId:'',academicSessionId:'',periodNumber:'1',sectionId:''}),[allocationSelected,setAllocationSelected]=useState([]);
  const [sectionSubTab,setSectionSubTab]=useState('create');
  const [editingSection,setEditingSection]=useState('');
  const [changeFind,setChangeFind]=useState({sessionId:'',programId:'',sectionId:'',rollNo:''}),[changeStudent,setChangeStudent]=useState(null),[changeTarget,setChangeTarget]=useState({programId:'',sectionId:'',reason:''});
  const [suspendFind,setSuspendFind]=useState({sessionId:'',programId:'',sectionId:'',rollNo:''}),[suspendStudent,setSuspendStudent]=useState(null),[suspendAction,setSuspendAction]=useState('suspended'),[suspendReason,setSuspendReason]=useState(''),[reactivationInstructions,setReactivationInstructions]=useState('Contact college administration for reactivation procedure.'),[suspensionUntil,setSuspensionUntil]=useState('');
  const [promotion,setPromotion]=useState({sourceSessionId:'',sourceProgramId:'',sourceSectionId:'',targetSessionId:'',targetProgramId:'',targetSectionId:'',reason:'Academic promotion'}),[promotionSelected,setPromotionSelected]=useState([]);
  const [progressFilters,setProgressFilters]=useState({sessionId:'',programId:'',sectionId:'',studentId:''});
  const [progressData,setProgressData]=useState(null);
  const [reportsSubTab,setReportsSubTab]=useState(requested==='progress'?'progress':'students');
  const studentReportColumnOptions=[
    ['admissionNo','Admission No'],
    ['rollNo','Roll No'],
    ['name','Student Name'],
    ['fatherName','Father Name'],
    ['program','Class / Program'],
    ['period','Period'],
    ['section','Section'],
    ['status','Status'],
    ['phone','Mobile No']
  ];
  const [studentReportFilters,setStudentReportFilters]=useState({sessionId:'',programId:'',sectionId:'',q:''});
  const [studentReportName,setStudentReportName]=useState('');
  const [generatedStudentReportName,setGeneratedStudentReportName]=useState('');
  const [studentReportOrientation,setStudentReportOrientation]=useState('landscape');
  const [studentReportColumns,setStudentReportColumns]=useState(['rollNo','name','fatherName','program','section']);
  const [studentReportExtraColumn,setStudentReportExtraColumn]=useState('remarks');
  const [studentReportReady,setStudentReportReady]=useState(false);

  function setTab(next){setTabState(next);navigate(`/students?tab=${next}`,{replace:true});setError('');setMessage('');}
  async function load(){try{const[r,se,ss,pp,ee]=await Promise.all([api.get('/students'),api.get('/academics/sections'),api.get('/academics/sessions'),api.get('/academics/programs'),api.get('/employees')]);setRows(r.data||[]);setSections(se.data||[]);setSessions(ss.data||[]);setPrograms(pp.data||[]);setTeachers((ee.data||[]).filter(e=>e.category==='academic_staff'||String(e.type||'').toLowerCase()==='teacher'));}catch(e){setError(errText(e));}}
  useEffect(()=>{load();},[]);
  useEffect(()=>{const q=new URLSearchParams(location.search).get('tab')||'list';if(q==='progress'){setTabState('reports');setReportsSubTab('progress');return;}if(validTabs.includes(q))setTabState(q);},[location.search]);

  const listSections=useMemo(()=>sections.filter(s=>(!filters.sessionId||idOf(s.academicSessionId)===filters.sessionId)&&(!filters.programId||idOf(s.programId)===filters.programId)),[sections,filters.sessionId,filters.programId]);
  const filteredRows=useMemo(()=>rows.filter(s=>{if(filters.sessionId&&idOf(s.academicSessionId)!==filters.sessionId)return false;if(filters.programId&&idOf(s.programId)!==filters.programId)return false;if(filters.sectionId&&idOf(s.sectionId)!==filters.sectionId)return false;const q=filters.q.trim().toLowerCase();if(!q)return true;return [s.rollNo,s.admissionNo,s.name,s.fatherName,s.phone].some(v=>String(v||'').toLowerCase().includes(q));}),[rows,filters]);
  const pageSlice=(items,page)=>items.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const pageCount=items=>Math.max(1,Math.ceil(items.length/PAGE_SIZE));
  function Pager({items,page,setPage}){const pages=pageCount(items),start=items.length?((page-1)*PAGE_SIZE+1):0,end=Math.min(page*PAGE_SIZE,items.length);return <div className="table-pager"><span>Showing {start}–{end} of {items.length}</span><div><button type="button" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Next</button></div></div>}
  useEffect(()=>{setListPage(1)},[filters.sessionId,filters.programId,filters.sectionId,filters.q]);
  useEffect(()=>{if(listPage>pageCount(filteredRows))setListPage(pageCount(filteredRows));},[filteredRows.length,listPage]);

  async function openDetails(s){setBusy(true);setError('');try{const {data}=await api.get(`/students/${s._id}`);const a=data.admissionApplicationId||{};setDetail(data);setDetailForm({studentName:a.studentName??data.name??'',fatherName:a.fatherName??data.fatherName??'',contactNo:a.contactNo??data.phone??'',email:a.email??data.email??'',address:a.address??data.address??'',fatherContact:a.fatherContact||'',whatsappNo:a.whatsappNo||'',guardianName:a.guardianName||'',guardianContact:a.guardianContact||'',guardianRelation:a.guardianRelation||'',bFormCnic:a.bFormCnic??data.cnic??'',fatherCnic:a.fatherCnic||'',dateOfBirth:(a.dateOfBirth||data.dateOfBirth||'').toString().slice(0,10),gender:a.gender??data.gender??'',previousSchool:a.previousSchool||'',bloodGroup:a.bloodGroup||'',secondAddress:a.secondAddress||'',alternateContactNo:a.alternateContactNo||''});}catch(e){setError(errText(e));}finally{setBusy(false);}}
  async function saveDetails(e){e.preventDefault();setBusy(true);setError('');try{await api.put(`/students/${detail._id}/admission-profile`,detailForm);await load();setDetail(null);setMessage('Admission Form details updated.');}catch(e2){setError(errText(e2));}finally{setBusy(false);}}

  const selectedProgram=programs.find(p=>String(p._id)===String(sectionForm.programId));
  const sectionPeriodCount=Number(selectedProgram?.durationUnits||selectedProgram?.durationSemesters||1);
  function resetSection(){setEditingSection('');setSectionForm({programId:'',academicSessionId:'',periodNumber:'1',genderType:'boys',name:'',capacity:50,classTeacherId:''});}
  function editSection(s){setEditingSection(s._id);setSectionForm({programId:idOf(s.programId),academicSessionId:idOf(s.academicSessionId),periodNumber:String(s.periodNumber||s.semester||1),genderType:s.genderType||'boys',name:s.name||'',capacity:s.capacity||50,classTeacherId:idOf(s.classTeacherId)});}
  async function saveSection(e){e.preventDefault();setBusy(true);setError('');try{const payload={...sectionForm,capacity:Number(sectionForm.capacity||50),periodNumber:Number(sectionForm.periodNumber||1),semester:Number(sectionForm.periodNumber||1),classTeacherId:sectionForm.classTeacherId||null};if(editingSection)await api.put(`/academics/sections/${editingSection}`,payload);else await api.post('/academics/sections',payload);resetSection();await load();setMessage('Section saved.');}catch(e2){setError(errText(e2));}finally{setBusy(false);}}
  async function deleteSection(s){if(!confirm(`Delete section ${s.name}?`))return;try{await api.delete(`/academics/sections/${s._id}`);await load();}catch(e){setError(errText(e));}}

  const allocationProgram=programs.find(x=>String(x._id)===String(allocation.programId));
  const allocationSections=useMemo(()=>sections.filter(s=>
    idOf(s.programId)===allocation.programId&&idOf(s.academicSessionId)===allocation.academicSessionId&&
    Number(s.periodNumber||s.semester||1)===Number(allocation.periodNumber||1)
  ),[sections,allocation.programId,allocation.academicSessionId,allocation.periodNumber]);
  const allocationTarget=allocationSections.find(s=>String(s._id)===String(allocation.sectionId));
  const allocationStudents=useMemo(()=>rows.filter(s=>{
    if(s.status!=='active'||idOf(s.sectionId))return false;
    if(allocation.programId&&idOf(s.programId)!==allocation.programId)return false;
    if(allocation.academicSessionId&&idOf(s.academicSessionId)!==allocation.academicSessionId)return false;
    if(Number(s.currentPeriod||s.currentSemester||1)!==Number(allocation.periodNumber||1))return false;
    if(allocationTarget?.genderType==='boys'&&!['male','boy','boys','m'].includes(String(s.gender||'').toLowerCase()))return false;
    if(allocationTarget?.genderType==='girls'&&!['female','girl','girls','f'].includes(String(s.gender||'').toLowerCase()))return false;
    return true;
  }),[rows,allocation,allocationTarget]);
  async function assignSelectedStudents(){
    if(!allocation.sectionId||!allocationSelected.length)return;
    setBusy(true);setError('');setMessage('');
    try{
      for(const studentId of allocationSelected)await api.post(`/students/${studentId}/assign-section`,{sectionId:allocation.sectionId});
      const count=allocationSelected.length;setAllocationSelected([]);await load();setMessage(`${count} student(s) assigned to ${allocationTarget?.name||'section'} successfully.`);
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  }

  const changeCurrentSections=useMemo(()=>sections.filter(s=>(!changeFind.sessionId||idOf(s.academicSessionId)===changeFind.sessionId)&&(!changeFind.programId||idOf(s.programId)===changeFind.programId)),[sections,changeFind.sessionId,changeFind.programId]);
  function findForChange(){const roll=changeFind.rollNo.trim().toLowerCase();const s=rows.find(x=>x.status==='active'&&idOf(x.academicSessionId)===changeFind.sessionId&&idOf(x.programId)===changeFind.programId&&idOf(x.sectionId)===changeFind.sectionId&&String(x.rollNo||'').toLowerCase()===roll);setChangeStudent(s||null);setChangeTarget({programId:s?idOf(s.programId):'',sectionId:'',reason:''});if(!s)setError('No active student found with this Session, Class/Program, Section and Roll No.');else setError('');}
  const changeTargetSections=useMemo(()=>sections.filter(s=>changeStudent&&idOf(s.academicSessionId)===idOf(changeStudent.academicSessionId)&&idOf(s.programId)===changeTarget.programId&&Number(s.periodNumber||s.semester||1)===periodNo(changeStudent)),[sections,changeStudent,changeTarget.programId]);
  async function saveClassChange(e){e.preventDefault();if(!changeStudent||!changeTarget.sectionId)return;setBusy(true);setError('');try{await api.post(`/students/${changeStudent._id}/change-class`,{sectionId:changeTarget.sectionId,reason:changeTarget.reason});await load();setMessage('Class / Section changed successfully.');setChangeStudent(null);setChangeFind({sessionId:'',programId:'',sectionId:'',rollNo:''});}catch(e2){setError(errText(e2));}finally{setBusy(false);}}

  const suspendSections=useMemo(()=>sections.filter(s=>(!suspendFind.sessionId||idOf(s.academicSessionId)===suspendFind.sessionId)&&(!suspendFind.programId||idOf(s.programId)===suspendFind.programId)),[sections,suspendFind.sessionId,suspendFind.programId]);
  function findForSuspend(){const roll=suspendFind.rollNo.trim().toLowerCase();const s=rows.find(x=>x.status==='active'&&idOf(x.academicSessionId)===suspendFind.sessionId&&idOf(x.programId)===suspendFind.programId&&idOf(x.sectionId)===suspendFind.sectionId&&String(x.rollNo||'').toLowerCase()===roll);setSuspendStudent(s||null);if(!s)setError('No active student found with this Session, Class/Program, Section and Roll No.');else setError('');}
  async function applySuspend(e){e.preventDefault();if(!suspendStudent||!suspendReason.trim())return;const label=suspendAction==='dropped'?'Drop':'Suspend';if(!confirm(`${label} ${suspendStudent.name}?`))return;setBusy(true);try{await api.post(`/students/${suspendStudent._id}/status`,{status:suspendAction,reason:suspendReason.trim(),reactivationInstructions:suspendAction==='suspended'?reactivationInstructions.trim():'',suspensionUntil:suspendAction==='suspended'?(suspensionUntil||null):null});await load();setMessage(suspendAction==='dropped'?'Student dropped permanently from active operations. Login is deactivated; historical records are preserved.':'Student suspended. Login remains available in restricted mode and will show the reactivation procedure.');setSuspendStudent(null);setSuspendReason('');setSuspensionUntil('');}catch(e2){setError(errText(e2));}finally{setBusy(false);}}

  const sourceSections=useMemo(()=>sections.filter(x=>(!promotion.sourceSessionId||idOf(x.academicSessionId)===promotion.sourceSessionId)&&(!promotion.sourceProgramId||idOf(x.programId)===promotion.sourceProgramId)),[sections,promotion.sourceSessionId,promotion.sourceProgramId]);
  const sourceProgram=programs.find(x=>String(x._id)===String(promotion.sourceProgramId)),sourceSection=sections.find(x=>String(x._id)===String(promotion.sourceSectionId));
  const sourcePeriod=Number(sourceSection?.periodNumber||sourceSection?.semester||1),maxPeriod=Number(sourceProgram?.durationUnits||sourceProgram?.durationSemesters||1),within=['college','university'].includes(sourceProgram?.academicType),finalPeriod=within&&sourcePeriod>=maxPeriod,nextPeriod=sourcePeriod+1;
  const targetPrograms=within?(sourceProgram?[sourceProgram]:[]):programs.filter(p=>!sourceProgram||p.academicType===sourceProgram.academicType);
  const targetSections=sections.filter(x=>within?(idOf(x.academicSessionId)===promotion.sourceSessionId&&idOf(x.programId)===promotion.sourceProgramId&&Number(x.periodNumber||x.semester||1)===nextPeriod):((!promotion.targetSessionId||idOf(x.academicSessionId)===promotion.targetSessionId)&&(!promotion.targetProgramId||idOf(x.programId)===promotion.targetProgramId)));
  const promotionStudents=rows.filter(x=>x.status==='active'&&(!promotion.sourceSessionId||idOf(x.academicSessionId)===promotion.sourceSessionId)&&(!promotion.sourceProgramId||idOf(x.programId)===promotion.sourceProgramId)&&(!promotion.sourceSectionId||idOf(x.sectionId)===promotion.sourceSectionId));
  async function bulkPromote(e){e.preventDefault();if(!promotionSelected.length||(!finalPeriod&&!promotion.targetSectionId))return;if(!confirm(`${finalPeriod?'Complete':'Promote'} ${promotionSelected.length} selected student(s)?`))return;setBusy(true);try{const r=await api.post('/students/bulk-promote',{studentIds:promotionSelected,targetSectionId:finalPeriod?null:promotion.targetSectionId,targetAcademicSessionId:within?promotion.sourceSessionId:promotion.targetSessionId,reason:promotion.reason,completeProgram:finalPeriod});setPromotionSelected([]);await load();setMessage(r.data?.message||'Students updated.');}catch(e2){setError(errText(e2));}finally{setBusy(false);}}

  const studentReportPrograms=useMemo(()=>{
    if(!studentReportFilters.sessionId)return programs;
    const ids=new Set(sections.filter(s=>idOf(s.academicSessionId)===studentReportFilters.sessionId).map(s=>idOf(s.programId)));
    return programs.filter(p=>ids.has(idOf(p)));
  },[programs,sections,studentReportFilters.sessionId]);

  const studentReportSections=useMemo(()=>sections.filter(s=>
    (!studentReportFilters.sessionId||idOf(s.academicSessionId)===studentReportFilters.sessionId)&&
    (!studentReportFilters.programId||idOf(s.programId)===studentReportFilters.programId)
  ),[sections,studentReportFilters.sessionId,studentReportFilters.programId]);

  const selectedStudentReportSession=sessions.find(s=>idOf(s)===studentReportFilters.sessionId);
  const selectedStudentReportProgram=programs.find(p=>idOf(p)===studentReportFilters.programId);
  const selectedStudentReportSection=sections.find(s=>idOf(s)===studentReportFilters.sectionId);
  const studentReportScopeTitle=studentReportFilters.sectionId
    ? `${selectedStudentReportSection?.name||'Section'} Student Report`
    : studentReportFilters.programId
      ? `${selectedStudentReportProgram?.name||'Class / Program'} Student Report`
      : studentReportFilters.sessionId
        ? `${selectedStudentReportSession?.name||'Session'} Student Report`
        : 'All Students Report';
  const studentReportScopeText=[
    selectedStudentReportSession?.name ? `Session: ${selectedStudentReportSession.name}` : '',
    selectedStudentReportProgram?.name ? `Class / Program: ${selectedStudentReportProgram.name}` : '',
    selectedStudentReportSection?.name ? `Section: ${selectedStudentReportSection.name}` : ''
  ].filter(Boolean).join(' • ');

  const studentReportRows=useMemo(()=>rows.filter(s=>{
    if(studentReportFilters.sessionId&&idOf(s.academicSessionId)!==studentReportFilters.sessionId)return false;
    if(studentReportFilters.programId&&idOf(s.programId)!==studentReportFilters.programId)return false;
    if(studentReportFilters.sectionId&&idOf(s.sectionId)!==studentReportFilters.sectionId)return false;
    const q=studentReportFilters.q.trim().toLowerCase();
    if(q&&![s.admissionNo,s.rollNo,s.name,s.fatherName,s.phone].some(v=>String(v||'').toLowerCase().includes(q)))return false;
    return true;
  }).map(s=>({
    _id:s._id,
    admissionNo:s.admissionNo||'—',
    rollNo:s.rollNo||'—',
    name:s.name||'—',
    fatherName:s.fatherName||'—',
    program:s.programId?.name||'—',
    period:`${periodLabel(s.programId)} ${periodNo(s)}`,
    section:s.sectionId?.name||'—',
    status:s.status||'—',
    phone:s.phone||'—'
  })),[rows,studentReportFilters]);

  function toggleStudentReportColumn(key){
    setStudentReportColumns(cols=>cols.includes(key)?cols.filter(x=>x!==key):[...cols,key]);
    setStudentReportReady(false);
  }
  function generateStudentReport(){
    const reportName=studentReportName.trim();
    if(!reportName){setError('Enter the Report Name before generating the Student Report.');return;}
    if(!studentReportColumns.length){setError('Select at least one column for the Student Report.');return;}
    setError('');setMessage('');setGeneratedStudentReportName(reportName);setStudentReportReady(true);
  }
  function printStudentReport(){
    if(!studentReportReady)return;
    window.print();
  }

  const progressSections=useMemo(()=>sections.filter(s=>(!progressFilters.sessionId||idOf(s.academicSessionId)===progressFilters.sessionId)&&(!progressFilters.programId||idOf(s.programId)===progressFilters.programId)),[sections,progressFilters.sessionId,progressFilters.programId]);
  const progressStudents=useMemo(()=>rows.filter(s=>(!progressFilters.sessionId||idOf(s.academicSessionId)===progressFilters.sessionId)&&(!progressFilters.programId||idOf(s.programId)===progressFilters.programId)&&(!progressFilters.sectionId||idOf(s.sectionId)===progressFilters.sectionId)),[rows,progressFilters]);
  async function loadProgressReport(){
    if(!progressFilters.studentId){setError('Select a student for the Progress Report.');return;}
    setBusy(true);setError('');setMessage('');
    try{const {data}=await api.get(`/students/${progressFilters.studentId}/progress`);setProgressData(data);}catch(e){setError(errText(e));}finally{setBusy(false);}
  }

  return <div className="students-page"><h1>Students</h1>
    <div className="tabs"><button className={tab==='list'?'active':''} onClick={()=>setTab('list')}>Student List</button><button className={tab==='sections'?'active':''} onClick={()=>setTab('sections')}>Sections</button><button className={tab==='change-class'?'active':''} onClick={()=>setTab('change-class')}>Change Class</button><button className={tab==='suspend'?'active':''} onClick={()=>setTab('suspend')}>Suspend Student</button><button className={tab==='promotion'?'active':''} onClick={()=>setTab('promotion')}>Promote Class</button><button className={tab==='reports'?'active':''} onClick={()=>setTab('reports')}>Reports</button></div>
    {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}

    {tab==='list'&&<>{!detail&&<><div className="inline-form"><select value={filters.sessionId} onChange={e=>setFilters({...filters,sessionId:e.target.value,sectionId:''})}><option value="">All Sessions</option>{sessions.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={filters.programId} onChange={e=>setFilters({...filters,programId:e.target.value,sectionId:''})}><option value="">All Classes / Programs</option>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={filters.sectionId} onChange={e=>setFilters({...filters,sectionId:e.target.value})}><option value="">All Sections</option>{listSections.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><input placeholder="Search Roll, Admission, Name, Father, Mobile" value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})}/></div>
      <table><thead><tr><th>Admission No</th><th>Roll No</th><th>Name</th><th>Class / Program</th><th>Period</th><th>Section</th><th>Status</th><th>Action</th></tr></thead><tbody>{pageSlice(filteredRows,listPage).map(s=><tr key={s._id}><td>{s.admissionNo||'—'}</td><td>{s.rollNo||'—'}</td><td>{s.name}</td><td>{s.programId?.name||'—'}</td><td>{periodLabel(s.programId)} {periodNo(s)}</td><td>{s.sectionId?.name||'—'}</td><td>{s.status}</td><td><button onClick={()=>openDetails(s)}>View Details</button></td></tr>)}</tbody></table><Pager items={filteredRows} page={listPage} setPage={setListPage}/></>}
      {detail&&<div className="student-detail-inline"><div className="student-detail-modal"><div className="student-detail-head"><div><h2>Student Details</h2><p>Complete student profile. Only Admission Form data can be corrected here.</p></div><button type="button" onClick={()=>setDetail(null)}>Close</button></div>
        <section className="student-detail-section"><h3>Reference Information <span>Read Only</span></h3><div className="student-reference-grid">
          <label>Admission / Form No.<input readOnly value={detail.admissionNo||'—'}/></label>
          <label>Roll No.<input readOnly value={detail.rollNo||'—'}/></label>
          <label>Status<input readOnly value={detail.status||'—'}/></label>
          <label>Session<input readOnly value={detail.academicSessionId?.name||'—'}/></label>
          <label>Class / Program<input readOnly value={detail.programId?.name||'—'}/></label>
          <label>{periodLabel(detail.programId)}<input readOnly value={`${periodLabel(detail.programId)} ${periodNo(detail)}`}/></label>
          <label>Section<input readOnly value={detail.sectionId?.name||'—'}/></label>
        </div></section>
        <form onSubmit={saveDetails}>
          <section className="student-detail-section"><h3>Admission Form Data <span>Editable</span></h3><div className="student-edit-grid">{[['studentName','Student Name'],['fatherName','Father Name'],['contactNo','Contact No'],['fatherContact','Father Contact'],['whatsappNo','WhatsApp No'],['email','Email'],['guardianName','Guardian Name'],['guardianContact','Guardian Contact'],['guardianRelation','Guardian Relation'],['bFormCnic','B-Form / CNIC'],['fatherCnic','Father CNIC'],['previousSchool','Previous School'],['bloodGroup','Blood Group'],['alternateContactNo','Alternate Contact']].map(([k,l])=><label key={k}>{l}<input value={detailForm[k]||''} onChange={e=>setDetailForm({...detailForm,[k]:e.target.value})}/></label>)}<label>Date of Birth<input type="date" value={detailForm.dateOfBirth||''} onChange={e=>setDetailForm({...detailForm,dateOfBirth:e.target.value})}/></label><label>Gender<select value={detailForm.gender||''} onChange={e=>setDetailForm({...detailForm,gender:e.target.value})}><option value="">Select</option><option value="male">Male</option><option value="female">Female</option></select></label><label className="student-address-field">Address<textarea rows="3" value={detailForm.address||''} onChange={e=>setDetailForm({...detailForm,address:e.target.value})}/></label></div></section>
          <section className="student-detail-section"><h3>Fee Summary <span>Read Only</span></h3><div className="student-fee-summary"><div><small>Total Package</small><strong>{money(detail.feeSummary?.totalPackage)}</strong></div><div><small>Paid</small><strong>{money(detail.feeSummary?.paid)}</strong></div><div><small>Pending</small><strong>{money(detail.feeSummary?.pending)}</strong></div></div>{!detail.feeSummary?.hasPackage&&<p className="student-fee-note">No fee package has been defined for this student.</p>}</section>
          <div className="student-detail-actions"><button disabled={busy}>Save Admission Form Corrections</button></div>
        </form>
      </div></div>}</>}

    {tab==='sections'&&<><h2>Sections</h2>
      <div className="section-subtabs">
        <button type="button" className={sectionSubTab==='create'?'active':''} onClick={()=>setSectionSubTab('create')}>Create Sections</button>
        <button type="button" className={sectionSubTab==='assign'?'active':''} onClick={()=>setSectionSubTab('assign')}>Assign Students</button>
      </div>
      {sectionSubTab==='create'&&<>
        <form className="inline-form" onSubmit={saveSection}><select required value={sectionForm.programId} onChange={e=>{const nextProgram=programs.find(p=>String(p._id)===String(e.target.value));setSectionForm({...sectionForm,programId:e.target.value,periodNumber:'1',genderType:nextProgram?.academicType==='university'?sectionForm.genderType:(sectionForm.genderType==='both'?'boys':sectionForm.genderType)});}}><option value="">Class / Program</option>{programs.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select><select required value={sectionForm.academicSessionId} onChange={e=>setSectionForm({...sectionForm,academicSessionId:e.target.value})}><option value="">Academic Session</option>{sessions.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select><select required disabled={!selectedProgram} value={sectionForm.periodNumber} onChange={e=>setSectionForm({...sectionForm,periodNumber:e.target.value})}>{Array.from({length:sectionPeriodCount},(_,i)=>i+1).map(n=><option key={n} value={n}>{periodLabel(selectedProgram)} {n}</option>)}</select><select value={sectionForm.genderType} onChange={e=>setSectionForm({...sectionForm,genderType:e.target.value})}><option value="boys">Boys</option><option value="girls">Girls</option>{selectedProgram?.academicType==='university'&&<option value="both">Both</option>}</select><input required placeholder="Section name" value={sectionForm.name} onChange={e=>setSectionForm({...sectionForm,name:e.target.value})}/><input type="number" min="1" placeholder="Capacity" value={sectionForm.capacity} onChange={e=>setSectionForm({...sectionForm,capacity:e.target.value})}/><select value={sectionForm.classTeacherId} onChange={e=>setSectionForm({...sectionForm,classTeacherId:e.target.value})}><option value="">Class Teacher (Optional)</option>{teachers.map(t=><option key={t._id} value={t._id}>{t.name}</option>)}</select><button disabled={busy}>{editingSection?'Update':'Add'}</button>{editingSection&&<button type="button" onClick={resetSection}>Cancel</button>}</form>
        <table><thead><tr><th>Section</th><th>Class / Program</th><th>Session</th><th>Period</th><th>Gender</th><th>Capacity</th><th>Class Teacher</th><th>Actions</th></tr></thead><tbody>{sections.map(s=><tr key={s._id}><td>{s.name}</td><td>{s.programId?.name}</td><td>{s.academicSessionId?.name}</td><td>{periodLabel(s.programId)} {s.periodNumber||s.semester||1}</td><td>{sectionGenderLabel(s.genderType)}</td><td>{s.capacity}</td><td>{s.classTeacherId?.name||'Not Assigned'}</td><td><button onClick={()=>editSection(s)}>Edit</button> <button onClick={()=>deleteSection(s)}>Delete</button></td></tr>)}</tbody></table>
      </>}


      {sectionSubTab==='assign'&&<div className="panel section-allocation-panel">
        <h3>Assign Students to Section</h3>
        <p className="muted">Only active students without a section are shown. Section gender compatibility and capacity are validated by the server. University sections set to Both accept boys and girls.</p>
        <div className="inline-form">
          <select value={allocation.programId} onChange={e=>{setAllocation({...allocation,programId:e.target.value,sectionId:'',periodNumber:'1'});setAllocationSelected([]);}}><option value="">Class / Program</option>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select>
          <select value={allocation.academicSessionId} onChange={e=>{setAllocation({...allocation,academicSessionId:e.target.value,sectionId:''});setAllocationSelected([]);}}><option value="">Academic Session</option>{sessions.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select>
          <select disabled={!allocationProgram} value={allocation.periodNumber} onChange={e=>{setAllocation({...allocation,periodNumber:e.target.value,sectionId:''});setAllocationSelected([]);}}>{Array.from({length:Number(allocationProgram?.durationUnits||allocationProgram?.durationSemesters||1)},(_,i)=>i+1).map(n=><option key={n} value={n}>{periodLabel(allocationProgram)} {n}</option>)}</select>
          <select value={allocation.sectionId} onChange={e=>{setAllocation({...allocation,sectionId:e.target.value});setAllocationSelected([]);}}><option value="">Target Section</option>{allocationSections.map(x=><option key={x._id} value={x._id}>{x.name} — {sectionGenderLabel(x.genderType)} ({x.capacity||50})</option>)}</select>
        </div>
        {allocation.sectionId&&<>
          <div className="row-actions section-allocation-actions"><button type="button" onClick={()=>setAllocationSelected(allocationStudents.map(x=>x._id))}>Select All ({allocationStudents.length})</button><button type="button" onClick={()=>setAllocationSelected([])}>Clear</button><span>{allocationSelected.length} selected</span></div>
          <table><thead><tr><th><input type="checkbox" checked={allocationStudents.length>0&&allocationSelected.length===allocationStudents.length} onChange={e=>setAllocationSelected(e.target.checked?allocationStudents.map(x=>x._id):[])}/></th><th>Roll No</th><th>Admission No</th><th>Student</th><th>Gender</th><th>Program</th><th>Period</th></tr></thead><tbody>{allocationStudents.length?allocationStudents.map(s=><tr key={s._id}><td><input type="checkbox" checked={allocationSelected.includes(s._id)} onChange={()=>setAllocationSelected(v=>v.includes(s._id)?v.filter(x=>x!==s._id):[...v,s._id])}/></td><td>{s.rollNo||'—'}</td><td>{s.admissionNo||'—'}</td><td>{s.name}</td><td>{s.gender||'—'}</td><td>{s.programId?.name||'—'}</td><td>{periodLabel(s.programId)} {periodNo(s)}</td></tr>):<tr><td colSpan="7">No eligible unassigned students found.</td></tr>}</tbody></table>
          <div className="form-actions"><button type="button" disabled={busy||!allocationSelected.length} onClick={assignSelectedStudents}>Assign Selected to {allocationTarget?.name||'Section'}</button></div>
        </>}
      </div>}
    </>}

    {tab==='change-class'&&<><h2>Change Class</h2><div className="panel"><h3>Find Current Student</h3><div className="inline-form"><select value={changeFind.sessionId} onChange={e=>setChangeFind({...changeFind,sessionId:e.target.value,sectionId:''})}><option value="">Current Session</option>{sessions.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={changeFind.programId} onChange={e=>setChangeFind({...changeFind,programId:e.target.value,sectionId:''})}><option value="">Current Program / Class</option>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={changeFind.sectionId} onChange={e=>setChangeFind({...changeFind,sectionId:e.target.value})}><option value="">Current Section</option>{changeCurrentSections.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><input placeholder="Roll No" value={changeFind.rollNo} onChange={e=>setChangeFind({...changeFind,rollNo:e.target.value})}/><button type="button" onClick={findForChange}>Find Student</button></div></div>{changeStudent&&<form className="panel" onSubmit={saveClassChange}><p><strong>{changeStudent.name}</strong> — {changeStudent.rollNo} — Current: {changeStudent.programId?.name} / {changeStudent.sectionId?.name}</p><div className="form-grid"><label>Change Program / Class To<select required value={changeTarget.programId} onChange={e=>setChangeTarget({...changeTarget,programId:e.target.value,sectionId:''})}>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label><label>Change Section To<select required value={changeTarget.sectionId} onChange={e=>setChangeTarget({...changeTarget,sectionId:e.target.value})}><option value="">Select Section</option>{changeTargetSections.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label></div><input placeholder="Reason / Remarks" required value={changeTarget.reason} onChange={e=>setChangeTarget({...changeTarget,reason:e.target.value})}/><button disabled={busy||!changeTarget.sectionId}>Change Class</button></form>}</>}

    {tab==='suspend'&&<><h2>Suspend Student</h2><div className="panel"><div className="inline-form"><select value={suspendFind.sessionId} onChange={e=>setSuspendFind({...suspendFind,sessionId:e.target.value,sectionId:''})}><option value="">Current Session</option>{sessions.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={suspendFind.programId} onChange={e=>setSuspendFind({...suspendFind,programId:e.target.value,sectionId:''})}><option value="">Current Program / Class</option>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={suspendFind.sectionId} onChange={e=>setSuspendFind({...suspendFind,sectionId:e.target.value})}><option value="">Current Section</option>{suspendSections.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><input placeholder="Roll No" value={suspendFind.rollNo} onChange={e=>setSuspendFind({...suspendFind,rollNo:e.target.value})}/><button onClick={findForSuspend}>Find Student</button></div></div>{suspendStudent&&<form className="panel" onSubmit={applySuspend}><p><strong>{suspendStudent.name}</strong> — {suspendStudent.programId?.name} / {suspendStudent.sectionId?.name}</p><div className="inline-form"><label><input type="radio" name="studentAction" checked={suspendAction==='suspended'} onChange={()=>setSuspendAction('suspended')}/> Suspend</label><label><input type="radio" name="studentAction" checked={suspendAction==='dropped'} onChange={()=>setSuspendAction('dropped')}/> Drop — permanently left</label></div><textarea required placeholder="Reason / Remarks" value={suspendReason} onChange={e=>setSuspendReason(e.target.value)}/>{suspendAction==='suspended'&&<><input type="date" value={suspensionUntil} onChange={e=>setSuspensionUntil(e.target.value)} title="Optional suspension review/end date"/><textarea required placeholder="Reactivation procedure shown to the student after login" value={reactivationInstructions} onChange={e=>setReactivationInstructions(e.target.value)}/><p className="muted">Suspended students can log in only to see the suspension message, reason and reactivation procedure. Normal portal functions remain restricted.</p></>}<p className="muted">Dropped students remain in history, their login is deactivated, and they are excluded from future operations.</p><button disabled={busy||!suspendReason.trim()||(suspendAction==='suspended'&&!reactivationInstructions.trim())}>{suspendAction==='dropped'?'Drop Student':'Suspend Student'}</button></form>}</>}

    {tab==='promotion'&&<><h2>Promote Class</h2><div className="panel"><h3>From</h3><div className="inline-form"><select value={promotion.sourceSessionId} onChange={e=>{setPromotion({...promotion,sourceSessionId:e.target.value,sourceSectionId:'',targetSessionId:'',targetProgramId:'',targetSectionId:''});setPromotionSelected([]);}}><option value="">Session</option>{sessions.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={promotion.sourceProgramId} onChange={e=>{const p=programs.find(x=>x._id===e.target.value),fixed=['college','university'].includes(p?.academicType);setPromotion({...promotion,sourceProgramId:e.target.value,sourceSectionId:'',targetSessionId:fixed?promotion.sourceSessionId:'',targetProgramId:fixed?e.target.value:'',targetSectionId:''});setPromotionSelected([]);}}><option value="">Class / Program</option>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={promotion.sourceSectionId} onChange={e=>{setPromotion({...promotion,sourceSectionId:e.target.value,targetSectionId:''});setPromotionSelected([]);}}><option value="">Section</option>{sourceSections.map(x=><option key={x._id} value={x._id}>{x.name} ({periodLabel(sourceProgram)} {x.periodNumber||x.semester||1})</option>)}</select></div>{promotion.sourceSectionId&&!finalPeriod&&<><h3>Promote To</h3><div className="inline-form">{within?<><input readOnly value={sessions.find(x=>x._id===promotion.sourceSessionId)?.name||''}/><input readOnly value={sourceProgram?.name||''}/><input readOnly value={`${periodLabel(sourceProgram)} ${nextPeriod}`}/></>:<><select value={promotion.targetSessionId} onChange={e=>setPromotion({...promotion,targetSessionId:e.target.value,targetSectionId:''})}><option value="">Target Session</option>{sessions.filter(x=>x._id!==promotion.sourceSessionId).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select><select value={promotion.targetProgramId} onChange={e=>setPromotion({...promotion,targetProgramId:e.target.value,targetSectionId:''})}><option value="">Target Class / Program</option>{targetPrograms.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></>}<select value={promotion.targetSectionId} onChange={e=>setPromotion({...promotion,targetSectionId:e.target.value})}><option value="">Target Section</option>{targetSections.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></div></>}{finalPeriod&&<p>Final {periodLabel(sourceProgram)}: selected students will Complete / Graduate Program.</p>}<input placeholder="Reason / Remarks" value={promotion.reason} onChange={e=>setPromotion({...promotion,reason:e.target.value})}/></div>{promotion.sourceSectionId&&<form onSubmit={bulkPromote}><div className="row-actions"><button type="button" onClick={()=>setPromotionSelected(promotionStudents.map(x=>x._id))}>Select All ({promotionStudents.length})</button><button type="button" onClick={()=>setPromotionSelected([])}>Clear</button><span>{promotionSelected.length} selected</span></div><table><thead><tr><th><input type="checkbox" checked={promotionStudents.length>0&&promotionSelected.length===promotionStudents.length} onChange={e=>setPromotionSelected(e.target.checked?promotionStudents.map(x=>x._id):[])}/></th><th>Roll No</th><th>Admission</th><th>Student</th><th>Class / Program</th><th>Section</th><th>Period</th></tr></thead><tbody>{promotionStudents.map(s=><tr key={s._id}><td><input type="checkbox" checked={promotionSelected.includes(s._id)} onChange={()=>setPromotionSelected(v=>v.includes(s._id)?v.filter(x=>x!==s._id):[...v,s._id])}/></td><td>{s.rollNo||'—'}</td><td>{s.admissionNo}</td><td>{s.name}</td><td>{s.programId?.name}</td><td>{s.sectionId?.name}</td><td>{periodLabel(s.programId)} {periodNo(s)}</td></tr>)}</tbody></table><div className="form-actions"><button disabled={busy||!promotionSelected.length||(!finalPeriod&&!promotion.targetSectionId)}>{finalPeriod?'Complete Selected Students':'Promote Selected Students'}</button></div></form>}</>}

    {tab==='reports'&&<section className="students-reports-section">
      <div className="section-subtabs students-report-subtabs">
        <button className={reportsSubTab==='students'?'active':''} onClick={()=>setReportsSubTab('students')}>Student Reports</button>
        <button className={reportsSubTab==='progress'?'active':''} onClick={()=>setReportsSubTab('progress')}>Progress Report</button>
      </div>

      {reportsSubTab==='students'&&<div className={`student-list-report cms-report-workspace print-${studentReportOrientation}`}>
        <div className="cms-report-head"><div><h2>Class / Program / Section Reports</h2><p>Select a Session only for the complete session list, add a Class / Program to narrow the report, or add a Section for section-wise students.</p></div>{studentReportReady&&<button type="button" onClick={printStudentReport}>Print Report</button>}</div>
        {studentReportReady&&<div className="cms-print-report-title student-list-print-title">{generatedStudentReportName||studentReportName}</div>}
        <div className="student-report-builder cms-report-filterbar">
          <label className="student-report-name-field"><span>Report Name *</span><input value={studentReportName} onChange={e=>{setStudentReportName(e.target.value);setStudentReportReady(false);}} placeholder="e.g. ICS Part-I Student List"/></label>
          <label><span>Page Orientation</span><select value={studentReportOrientation} onChange={e=>setStudentReportOrientation(e.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <label><span>Session</span><select value={studentReportFilters.sessionId} onChange={e=>{setStudentReportFilters({...studentReportFilters,sessionId:e.target.value,programId:'',sectionId:''});setStudentReportReady(false);}}><option value="">All Sessions</option>{sessions.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
          <label><span>Class / Program</span><select value={studentReportFilters.programId} onChange={e=>{setStudentReportFilters({...studentReportFilters,programId:e.target.value,sectionId:''});setStudentReportReady(false);}}><option value="">All Classes / Programs</option>{studentReportPrograms.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
          <label><span>Section</span><select value={studentReportFilters.sectionId} onChange={e=>{setStudentReportFilters({...studentReportFilters,sectionId:e.target.value});setStudentReportReady(false);}}><option value="">All Sections</option>{studentReportSections.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
          <label className="student-report-search"><span>Search</span><input value={studentReportFilters.q} onChange={e=>{setStudentReportFilters({...studentReportFilters,q:e.target.value});setStudentReportReady(false);}} placeholder="Roll, Admission, Name, Father, Mobile"/></label>
        </div>

        <div className="student-report-options">
          <div><h3>Select Columns</h3><div className="student-report-column-grid">{studentReportColumnOptions.map(([key,label])=><label key={key}><input type="checkbox" checked={studentReportColumns.includes(key)} onChange={()=>toggleStudentReportColumn(key)}/><span>{label}</span></label>)}</div></div>
          <div className="student-report-extra"><h3>Additional Column</h3><label><input type="radio" name="student-report-extra" checked={studentReportExtraColumn==='remarks'} onChange={()=>{setStudentReportExtraColumn('remarks');setStudentReportReady(false);}}/> Remarks</label><label><input type="radio" name="student-report-extra" checked={studentReportExtraColumn==='blank'} onChange={()=>{setStudentReportExtraColumn('blank');setStudentReportReady(false);}}/> Blank Column</label><label><input type="radio" name="student-report-extra" checked={studentReportExtraColumn==='none'} onChange={()=>{setStudentReportExtraColumn('none');setStudentReportReady(false);}}/> No Additional Column</label></div>
          <div className="student-report-actions"><button type="button" disabled={busy||!studentReportColumns.length||!studentReportName.trim()} onClick={generateStudentReport}>Generate Report</button>{studentReportReady&&<button type="button" onClick={printStudentReport}>Print Selected Columns</button>}</div>
        </div>

        {studentReportReady&&<div className="cms-report-table-card student-report-preview">
          <div className="student-report-print-name">{generatedStudentReportName||studentReportName}</div>
          <div className="cms-report-table-title"><div><h3>{generatedStudentReportName||studentReportScopeTitle}</h3><p>{studentReportScopeText?`${studentReportScopeText} • `:''}{studentReportRows.length} student{studentReportRows.length===1?'':'s'}</p></div></div>
          <div className="cms-report-table-wrap"><table><thead><tr><th>#</th>{studentReportColumnOptions.filter(([key])=>studentReportColumns.includes(key)).map(([key,label])=><th key={key}>{label}</th>)}{studentReportExtraColumn!=='none'&&<th>{studentReportExtraColumn==='remarks'?'Remarks':''}</th>}</tr></thead><tbody>{studentReportRows.map((r,i)=><tr key={r._id}><td>{i+1}</td>{studentReportColumnOptions.filter(([key])=>studentReportColumns.includes(key)).map(([key])=><td key={key}>{r[key]}</td>)}{studentReportExtraColumn!=='none'&&<td className="student-report-write-cell">&nbsp;</td>}</tr>)}{!studentReportRows.length&&<tr><td className="cms-report-empty" colSpan={studentReportColumns.length+2}>No students match the selected filters.</td></tr>}</tbody></table></div>
        </div>}
      </div>}

      {reportsSubTab==='progress'&&<div className="student-progress-report cms-report-workspace">
        <div className="cms-report-head"><div><h2>Student Progress Report</h2><p>Historical student progress combining attendance performance and published examination results.</p></div>{progressData&&<button type="button" onClick={()=>window.print()}>Print Progress Report</button>}</div>
      <div className="cms-report-filterbar">
        <label><span>Session</span><select value={progressFilters.sessionId} onChange={e=>{setProgressFilters({...progressFilters,sessionId:e.target.value,sectionId:'',studentId:''});setProgressData(null);}}><option value="">All Sessions</option>{sessions.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
        <label><span>Program</span><select value={progressFilters.programId} onChange={e=>{setProgressFilters({...progressFilters,programId:e.target.value,sectionId:'',studentId:''});setProgressData(null);}}><option value="">All Programs</option>{programs.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
        <label><span>Section</span><select value={progressFilters.sectionId} onChange={e=>{setProgressFilters({...progressFilters,sectionId:e.target.value,studentId:''});setProgressData(null);}}><option value="">All Sections</option>{progressSections.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
        <label><span>Student</span><select value={progressFilters.studentId} onChange={e=>{setProgressFilters({...progressFilters,studentId:e.target.value});setProgressData(null);}}><option value="">Select Student</option>{progressStudents.map(s=><option key={s._id} value={s._id}>{s.rollNo||s.admissionNo} — {s.name}</option>)}</select></label>
        <button type="button" disabled={busy} onClick={loadProgressReport}>Generate Report</button>
      </div>
      {!progressData?<div className="cms-report-table-card"><div className="cms-report-empty">Select a student and generate the Progress Report.</div></div>:<>
        <div className="student-progress-identity"><div><strong>{progressData.student?.name}</strong><span>{progressData.student?.rollNo||progressData.student?.admissionNo}</span></div><div><span>Father Name</span><b>{progressData.student?.fatherName||'—'}</b></div><div><span>Program</span><b>{progressData.student?.programId?.name||'—'}</b></div><div><span>Section</span><b>{progressData.student?.sectionId?.name||'—'}</b></div></div>
        <div className="cms-report-kpis">
          <div className="cms-report-kpi"><span>Attendance</span><strong>{progressData.attendance?.percentage||0}%</strong><small>{progressData.attendance?.total||0} attendance records</small></div>
          <div className="cms-report-kpi"><span>Latest Result</span><strong>{progressData.analysis?.latestExamPercentage||0}%</strong><small>{progressData.analysis?.latestExamStatus||'—'}</small></div>
          <div className="cms-report-kpi"><span>Academic Trend</span><strong>{progressData.analysis?.academicTrend>0?'+':''}{progressData.analysis?.academicTrend||0}%</strong><small>vs previous published exam</small></div>
          <div className="cms-report-kpi"><span>Progress Indicator</span><strong>{progressData.analysis?.overallIndicator||'—'}</strong><small>Attendance + latest result</small></div>
        </div>
        <div className="cms-report-table-card"><div className="cms-report-table-title"><div><h3>Attendance History</h3><p>Monthly attendance progression.</p></div></div><div className="cms-report-table-wrap"><table><thead><tr><th>Month</th><th>P</th><th>Lt</th><th>A</th><th>L</th><th>SL</th><th>Total</th><th>Attendance %</th></tr></thead><tbody>{(progressData.attendanceTrend||[]).map(r=><tr key={r.month}><td>{r.month}</td><td>{r.present}</td><td>{r.late}</td><td>{r.absent}</td><td>{r.leave}</td><td>{r.short_leave}</td><td>{r.total}</td><td><strong>{r.percentage}%</strong></td></tr>)}{!progressData.attendanceTrend?.length&&<tr><td colSpan="8" className="cms-report-empty">No attendance history available.</td></tr>}</tbody></table></div></div>
        <div className="cms-report-table-card"><div className="cms-report-table-title"><div><h3>Results Analysis</h3><p>Published examination performance over time.</p></div></div><div className="cms-report-table-wrap"><table><thead><tr><th>Exam</th><th>Published</th><th>Subjects</th><th>Obtained</th><th>Total</th><th>Percentage</th><th>GPA</th><th>Status</th></tr></thead><tbody>{(progressData.exams||[]).map(r=><tr key={r.examId}><td>{r.name}</td><td>{r.publishedAt?new Date(r.publishedAt).toLocaleDateString():'—'}</td><td>{r.subjects}</td><td>{r.obtainedMarks}</td><td>{r.totalMarks}</td><td><strong>{r.percentage}%</strong></td><td>{r.gpa||'—'}</td><td>{r.status}</td></tr>)}{!progressData.exams?.length&&<tr><td colSpan="8" className="cms-report-empty">No published examination results available.</td></tr>}</tbody></table></div></div>
      </>}
      </div>}
    </section>}

  </div>;
}
