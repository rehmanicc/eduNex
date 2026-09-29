import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../../api/client';
import AdmissionsModuleNav from './AdmissionsModuleNav';
import './admissions-modal.css';

const TYPES=[['all','All'],['inquiry','Pending Inquiries'],['not_interested','Not Interested'],['form_submitted','Form Submitted'],['incomplete_forms','Incomplete Forms'],['fee_pending','Fee Pending'],['provisional','Provisional'],['confirmed','Confirmed'],['staff_references','Staff References']];
const DEFAULT_LOGO='/branding/edunex-default-logo.png';
const labelForType=t=>TYPES.find(x=>x[0]===t)?.[1]||'Admissions';
const statusLabel=r=>r.status==='pending'?'Pending Inquiry':r.status==='followed_up'?'Pending Inquiry (Followed Up)':r.status==='not_interested'?'Not Interested':r.status==='form_submitted'?'Form Submitted':labelForType(r.status);
const id=v=>String(v?._id||v||'');
const date=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString();};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export default function AdmissionsReportsPage(){
  const [type,setType]=useState('all');
  const [filters,setFilters]=useState({academicSessionId:'',wingId:'',programId:'',from:'',to:''});
  const [data,setData]=useState({rows:[],counts:{},meta:{sessions:[],programs:[],wings:[]},college:null});
  const [generated,setGenerated]=useState(false);
  const [selectedStaffId,setSelectedStaffId]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const reportRef=useRef(null);

  // Load options/college once, but do not show a report until Generate Report is clicked.
  useEffect(()=>{(async()=>{try{const r=await api.get('/admissions/reports',{params:{type:'all'}});setData(d=>({...d,meta:r.data?.meta||d.meta,college:r.data?.college||null}));}catch(e){setError(e.response?.data?.error||e.message||'Unable to load report options.');}})();},[]);

  const programs=useMemo(()=>{const rows=data.meta?.programs||[];return filters.wingId?rows.filter(p=>id(p.wingId)===filters.wingId):rows;},[data.meta,filters.wingId]);
  function invalidate(){setGenerated(false);setSelectedStaffId('');setError('');}
  function setTypeFilter(v){setType(v);invalidate();}
  function setFilter(key,value){setFilters(f=>({...f,[key]:value}));invalidate();}
  function changeWing(value){setFilters(f=>({...f,wingId:value,programId:''}));invalidate();}

  async function generateReport(){
    setLoading(true);setError('');
    try{const params={type};Object.entries(filters).forEach(([k,v])=>{if(v)params[k]=v;});const r=await api.get('/admissions/reports',{params});setData(r.data||{rows:[],counts:{},meta:{sessions:[],programs:[],wings:[]},college:null});setGenerated(true);}
    catch(e){setGenerated(false);setError(e.response?.data?.error||e.message||'Unable to generate admissions report.');}
    finally{setLoading(false);}
  }

  function criteria(){
    const s=(data.meta?.sessions||[]).find(x=>id(x)===filters.academicSessionId);
    const w=(data.meta?.wings||[]).find(x=>id(x)===filters.wingId);
    const p=(data.meta?.programs||[]).find(x=>id(x)===filters.programId);
    return [
      `Status: ${labelForType(type)}`,
      `Session: ${s?.name||'All Sessions'}`,
      `Wing: ${w?.name||'All Wings'}`,
      `Program/Class: ${p?.name||'All Programs / Classes'}`,
      filters.from||filters.to?`Date: ${filters.from||'Beginning'} to ${filters.to||'Today'}`:'Date: All Dates'
    ].join(' • ');
  }
  function reportTitle(){return type==='all'?'Admissions Report':`${labelForType(type)} Report`;}
  const selectedStaff=(data.staffSummary||[]).find(x=>id(x)===selectedStaffId)||null;

  function printReport(){
    if(!generated||!reportRef.current)return;
    const w=window.open('','_blank','width=1100,height=800');if(!w){setError('Pop-up blocked. Please allow pop-ups to print the report.');return;}
    const css=`@page{size:A4 portrait;margin:8mm 9mm 10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#172033;background:#fff}.admission-report-sheet{width:100%;margin:0;padding:0}.admission-report-header{display:grid;grid-template-columns:76px 1fr 76px;align-items:center;border-bottom:2px solid #173f73;padding:0 0 8px;margin:0 0 10px;min-height:76px}.admission-report-logo{width:68px;height:68px;display:flex;align-items:center;justify-content:center}.admission-report-logo img{max-width:100%;max-height:100%;object-fit:contain}.admission-report-identity{text-align:center}.admission-report-identity h1{margin:0;color:#123b6d;font-size:21px}.admission-report-identity .slogan{font-size:9px;letter-spacing:.07em;text-transform:uppercase;color:#64748b;margin:2px 0 5px}.admission-report-identity h2{margin:0;font-size:15px}.admission-report-identity p{margin:3px 0 0;font-size:8px;color:#64748b;line-height:1.35}.admission-report-contact{text-align:center;font-size:8px;color:#64748b;margin:-4px 0 9px}.admission-report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0 10px}.admission-report-kpis div{border:1px solid #dbe3ee;border-radius:6px;padding:6px;text-align:center}.admission-report-kpis span{display:block;font-size:8px;color:#64748b}.admission-report-kpis strong{font-size:15px;color:#173f73}table{width:100%;border-collapse:collapse;font-size:8px}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #d8dee8;padding:4px 5px;text-align:left;vertical-align:top}th{background:#eef3f9;color:#173f73;font-weight:700}.empty{text-align:center;padding:16px;color:#64748b}.admission-report-powered{text-align:center;margin-top:10px;padding-top:6px;border-top:1px solid #d8dee8;font-size:7px;color:#64748b}.no-print{display:none!important}.staff-reference-detail-title{font-size:11px;margin:10px 0 5px;color:#173f73}`;
    w.document.open();w.document.write(`<!doctype html><html><head><title>${esc(reportTitle())}</title><style>${css}</style></head><body>${reportRef.current.outerHTML}</body></html>`);w.document.close();
    const go=()=>{w.focus();w.print();};const imgs=w.document.images;if(!imgs.length)setTimeout(go,150);else{let done=0;const finish=()=>{done+=1;if(done>=imgs.length)setTimeout(go,100)};Array.from(imgs).forEach(img=>{if(img.complete)finish();else{img.onload=finish;img.onerror=finish;}});setTimeout(go,1000);}
  }

  function exportExcel(){
    if(!generated)return;
    if(type==='staff_references'){
      const wb=XLSX.utils.book_new();
      const summary=(data.staffSummary||[]).map(x=>({'Employee No':x.employeeNo||x.employeeCode||'','Staff Name':x.name||'','Designation':x.designationId?.name||x.designation||'','Category':x.category==='academic_staff'?'Academic':'Non-Academic','Employment Status':x.isActive?'Current':'Left','No. of References':x.referenceCount||0}));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),'Staff Summary');
      const details=(data.staffSummary||[]).flatMap(x=>(x.references||[]).map(r=>({'Employee No':x.employeeNo||x.employeeCode||'','Staff Name':x.name||'','Inquiry No':r.inquiryNo||'','Student Name':r.studentName||'','Father Name':r.fatherName||'','Contact No':r.contactNo||'','Session':r.academicSessionId?.name||'','Wing':r.programId?.wingId?.name||'','Program / Class':r.programId?.name||'','Inquiry Status':statusLabel(r),'Date':date(r.createdAt)})));
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(details),'Reference Details');
      XLSX.writeFile(wb,'staff-reference-report.xlsx');return;
    }
    const rows=(data.rows||[]).map(r=>({'Inquiry No':r.inquiryNo||'','Student Name':r.studentName||'','Father Name':r.fatherName||'','Contact No':r.contactNo||'','Session':r.academicSessionId?.name||'','Wing':r.programId?.wingId?.name||'','Program / Class':r.programId?.name||'','Status':statusLabel(r),'Form No':r.admissionApplicationId?.formNo||'','Inquiry Date':date(r.createdAt),'Form Submitted':date(r.formSubmittedAt),'Remarks':r.notes||''}));
    const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Admissions Report');XLSX.writeFile(wb,`${reportTitle().replace(/\s+/g,'-').toLowerCase()}.xlsx`);
  }

  const c=data.college||{};const logoSrc=c.logoUrl||DEFAULT_LOGO;
  return <div className="admissions-workspace admissions-reports-page"><AdmissionsModuleNav/><section className="admissions-page-content">
    <div className="admission-report-screen-head"><div><h2>Admissions Reports</h2><p className="muted">Generate, print and export admissions inquiry reports.</p></div><div className="admission-report-actions">{generated&&<><button onClick={printReport}>Print / PDF</button><button className="admission-secondary-action" onClick={exportExcel}>Export Excel</button></>}</div></div>
    {error&&<p className="error">{error}</p>}
    <div className="admission-report-filters">
      <label>Report Status<select value={type} onChange={e=>setTypeFilter(e.target.value)}>{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Session<select value={filters.academicSessionId} onChange={e=>setFilter('academicSessionId',e.target.value)}><option value="">All Sessions</option>{(data.meta?.sessions||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
      <label>Wing<select value={filters.wingId} onChange={e=>changeWing(e.target.value)}><option value="">All Wings</option>{(data.meta?.wings||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
      <label>Program / Class<select value={filters.programId} onChange={e=>setFilter('programId',e.target.value)}><option value="">All Programs / Classes</option>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
      <label>From<input type="date" value={filters.from} onChange={e=>setFilter('from',e.target.value)}/></label>
      <label>To<input type="date" value={filters.to} onChange={e=>setFilter('to',e.target.value)}/></label>
      <div className="admission-report-generate"><button onClick={generateReport} disabled={loading}>{loading?'Generating…':'Generate Report'}</button></div>
    </div>
    {!generated&&!loading&&<div className="admission-report-placeholder">Select the required filters and click <strong>Generate Report</strong>.</div>}
    {generated&&<div className="admission-report-sheet" ref={reportRef}>
      <header className="admission-report-header"><div className="admission-report-logo"><img src={logoSrc} onError={e=>{if(!e.currentTarget.src.endsWith(DEFAULT_LOGO))e.currentTarget.src=DEFAULT_LOGO;}} alt="Institute logo"/></div><div className="admission-report-identity"><h1>{c.name||'Institute'}</h1>{c.educationalSlogan&&<div className="slogan">{c.educationalSlogan}</div>}<h2>{reportTitle()}</h2><p>{criteria()}</p></div><div/></header>
      {(c.address||c.contactNo)&&<div className="admission-report-contact">{[c.address,c.contactNo].filter(Boolean).join(' • ')}</div>}
      {type==='staff_references'?<>
        <div className="admission-report-kpis staff-reference-kpis"><div><span>Staff With References</span><strong>{data.staffSummary?.length??0}</strong></div><div><span>Total Staff References</span><strong>{data.counts?.total??0}</strong></div></div>
        <div className="admission-report-table-wrap"><table><thead><tr><th>#</th><th>Employee No</th><th>Staff / Faculty</th><th>Designation</th><th>Category</th><th>Status</th><th>No. of References</th><th className="no-print">Action</th></tr></thead><tbody>
          {(data.staffSummary||[]).map((x,i)=><tr key={x._id}><td>{i+1}</td><td>{x.employeeNo||x.employeeCode||'—'}</td><td><strong>{x.name||'—'}</strong></td><td>{x.designationId?.name||x.designation||'—'}</td><td>{x.category==='academic_staff'?'Academic':'Non-Academic'}</td><td>{x.isActive?'Current':'Left'}</td><td><strong>{x.referenceCount||0}</strong></td><td className="no-print"><button type="button" className="staff-reference-view" onClick={()=>setSelectedStaffId(id(x))}>View</button></td></tr>)}
          {!data.staffSummary?.length&&<tr><td colSpan="8" className="empty">No staff references for the selected filters.</td></tr>}
        </tbody></table></div>
        {selectedStaff&&<div className="staff-reference-detail"><h3 className="staff-reference-detail-title">References by {selectedStaff.name} ({selectedStaff.referenceCount})</h3><div className="admission-report-table-wrap"><table><thead><tr><th>#</th><th>Inquiry No</th><th>Student / Father</th><th>Contact</th><th>Session</th><th>Program / Class</th><th>Status</th><th>Date</th></tr></thead><tbody>{(selectedStaff.references||[]).map((r,i)=><tr key={r._id}><td>{i+1}</td><td>{r.inquiryNo||'—'}</td><td><strong>{r.studentName||'—'}</strong><br/><small>{r.fatherName||'—'}</small></td><td>{r.contactNo||'—'}</td><td>{r.academicSessionId?.name||'—'}</td><td>{r.programId?.name||'—'}</td><td>{statusLabel(r)}</td><td>{date(r.createdAt)}</td></tr>)}</tbody></table></div></div>}
      </>:<>
        <div className="admission-report-kpis"><div><span>Total Inquiries</span><strong>{data.counts?.total??0}</strong></div><div><span>Pending Inquiries</span><strong>{data.counts?.pending??0}</strong></div><div><span>Not Interested</span><strong>{data.counts?.notInterested??0}</strong></div><div><span>Form Submitted</span><strong>{data.counts?.formSubmitted??0}</strong></div></div>
        <div className="admission-report-table-wrap"><table><thead><tr><th>#</th><th>Inquiry No</th><th>Student / Father</th><th>Contact</th><th>Session</th><th>Wing</th><th>Program / Class</th><th>Status</th><th>Form No</th><th>Date</th><th>Remarks</th></tr></thead><tbody>
          {(data.rows||[]).map((r,i)=><tr key={r._id}><td>{i+1}</td><td>{r.inquiryNo||'—'}</td><td><strong>{r.studentName||'—'}</strong><br/><small>{r.fatherName||'—'}</small></td><td>{r.contactNo||'—'}</td><td>{r.academicSessionId?.name||'—'}</td><td>{r.programId?.wingId?.name||'—'}</td><td>{r.programId?.name||'—'}</td><td>{statusLabel(r)}</td><td>{r.admissionApplicationId?.formNo||'—'}</td><td>{date(['form_submitted','incomplete_forms','fee_pending','provisional','confirmed'].includes(r.status)?(r.formSubmittedAt||r.createdAt):r.createdAt)}</td><td>{r.notes||'—'}</td></tr>)}
          {!data.rows?.length&&<tr><td colSpan="11" className="empty">No admissions records for the selected filters.</td></tr>}
        </tbody></table></div>
      </>}
      <div className="admission-report-powered">Powered by eduNex</div>
    </div>}
  </section></div>;
}
