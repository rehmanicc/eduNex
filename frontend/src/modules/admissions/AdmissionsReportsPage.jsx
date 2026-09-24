import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../../api/client';
import AdmissionsModuleNav from './AdmissionsModuleNav';
import './admissions-modal.css';

const TYPES=[['all','All'],['inquiry','Inquiry'],['not_interested','Not Interested'],['form_submitted','Form Submitted']];
const labelForType=t=>TYPES.find(x=>x[0]===t)?.[1]||'Admissions';
const id=v=>String(v?._id||v||'');
const date=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString();};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export default function AdmissionsReportsPage(){
  const [type,setType]=useState('all');
  const [filters,setFilters]=useState({academicSessionId:'',wingId:'',programId:'',from:'',to:''});
  const [data,setData]=useState({rows:[],counts:{},meta:{sessions:[],programs:[],wings:[]},college:null});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const reportRef=useRef(null);

  const programs=useMemo(()=>{
    const rows=data.meta?.programs||[];
    return filters.wingId?rows.filter(p=>id(p.wingId)===filters.wingId):rows;
  },[data.meta,filters.wingId]);

  async function load(){
    setLoading(true);setError('');
    try{
      const params={type};
      Object.entries(filters).forEach(([k,v])=>{if(v)params[k]=v;});
      const r=await api.get('/admissions/reports',{params});
      setData(r.data||{rows:[],counts:{},meta:{sessions:[],programs:[],wings:[]},college:null});
    }catch(e){setError(e.response?.data?.error||e.message||'Unable to load admissions report.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[type,filters.academicSessionId,filters.wingId,filters.programId,filters.from,filters.to]);

  function changeWing(value){setFilters(f=>({...f,wingId:value,programId:''}));}
  function subtitle(){
    const bits=[];
    const s=(data.meta?.sessions||[]).find(x=>id(x)===filters.academicSessionId);
    const w=(data.meta?.wings||[]).find(x=>id(x)===filters.wingId);
    const p=(data.meta?.programs||[]).find(x=>id(x)===filters.programId);
    if(s)bits.push(`Session: ${s.name}`);if(w)bits.push(`Wing: ${w.name}`);if(p)bits.push(`Program/Class: ${p.name}`);
    if(filters.from||filters.to)bits.push(`Date: ${filters.from||'Beginning'} to ${filters.to||'Today'}`);
    return bits.length?bits.join(' • '):'All selected admissions data';
  }
  function reportTitle(){return type==='all'?'Admissions Report':`${labelForType(type)} Admissions Report`;}

  function printReport(){
    if(!reportRef.current)return;
    const w=window.open('','_blank','width=1100,height=800');
    if(!w){setError('Pop-up blocked. Please allow pop-ups to print the report.');return;}
    const css=`
      @page{size:A4 portrait;margin:8mm 9mm 10mm}
      *{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#172033;background:#fff}
      .admission-report-sheet{width:100%;margin:0;padding:0}.admission-report-header{display:grid;grid-template-columns:76px 1fr 76px;align-items:center;border-bottom:2px solid #173f73;padding:0 0 8px;margin:0 0 10px;min-height:76px}
      .admission-report-logo{width:68px;height:68px;display:flex;align-items:center;justify-content:center}.admission-report-logo img{max-width:100%;max-height:100%;object-fit:contain}.admission-report-logo span{font-size:10px;color:#94a3b8}
      .admission-report-identity{text-align:center}.admission-report-identity h1{margin:0;color:#123b6d;font-size:21px}.admission-report-identity .slogan{font-size:9px;letter-spacing:.07em;text-transform:uppercase;color:#64748b;margin:2px 0 5px}.admission-report-identity h2{margin:0;font-size:15px}.admission-report-identity p{margin:3px 0 0;font-size:9px;color:#64748b}.admission-report-contact{text-align:center;font-size:8px;color:#64748b;margin:-4px 0 9px}
      .admission-report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0 10px}.admission-report-kpis div{border:1px solid #dbe3ee;border-radius:6px;padding:6px;text-align:center}.admission-report-kpis span{display:block;font-size:8px;color:#64748b}.admission-report-kpis strong{font-size:15px;color:#173f73}
      table{width:100%;border-collapse:collapse;font-size:8px}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #d8dee8;padding:4px 5px;text-align:left;vertical-align:top}th{background:#eef3f9;color:#173f73;font-weight:700}.empty{text-align:center;padding:16px;color:#64748b}.screen-only{display:none!important}
    `;
    w.document.open();
    w.document.write(`<!doctype html><html><head><title>${esc(reportTitle())}</title><style>${css}</style></head><body>${reportRef.current.outerHTML}</body></html>`);
    w.document.close();
    const go=()=>{w.focus();w.print();};
    const imgs=w.document.images;
    if(!imgs.length)setTimeout(go,150);else{let done=0;const finish=()=>{done+=1;if(done>=imgs.length)setTimeout(go,100)};Array.from(imgs).forEach(img=>{if(img.complete)finish();else{img.onload=finish;img.onerror=finish;}});setTimeout(go,1000);}
  }

  function exportExcel(){
    const rows=(data.rows||[]).map(r=>({
      'Inquiry No':r.inquiryNo||'', 'Student Name':r.studentName||'', 'Father Name':r.fatherName||'',
      'Contact No':r.contactNo||'', 'Session':r.academicSessionId?.name||'', 'Wing':r.programId?.wingId?.name||'',
      'Program / Class':r.programId?.name||'', 'Status':r.status==='followed_up'?'Inquiry (Followed Up)':labelForType(r.status==='pending'?'inquiry':r.status),
      'Form No':r.admissionApplicationId?.formNo||'', 'Inquiry Date':date(r.createdAt), 'Form Submitted':date(r.formSubmittedAt),
      'Remarks':r.notes||''
    }));
    const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Admissions Report');XLSX.writeFile(wb,`${reportTitle().replace(/\s+/g,'-').toLowerCase()}.xlsx`);
  }

  const c=data.college||{};
  return <div className="admissions-workspace admissions-reports-page">
    <AdmissionsModuleNav/>
    <section className="admissions-page-content">
      <div className="admission-report-screen-head"><div><h2>Admissions Reports</h2><p className="muted">Print and export Inquiry, Not Interested and Form Submitted records.</p></div><div className="admission-report-actions"><button onClick={printReport}>Print / PDF</button><button className="admission-secondary-action" onClick={exportExcel}>Export Excel</button></div></div>
      {error&&<p className="error">{error}</p>}
      <div className="admission-report-filters">
        <label>Report Status<select value={type} onChange={e=>setType(e.target.value)}>{TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label>Session<select value={filters.academicSessionId} onChange={e=>setFilters(f=>({...f,academicSessionId:e.target.value}))}><option value="">All Sessions</option>{(data.meta?.sessions||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
        <label>Wing<select value={filters.wingId} onChange={e=>changeWing(e.target.value)}><option value="">All Wings</option>{(data.meta?.wings||[]).map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
        <label>Program / Class<select value={filters.programId} onChange={e=>setFilters(f=>({...f,programId:e.target.value}))}><option value="">All Programs / Classes</option>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
        <label>From<input type="date" value={filters.from} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/></label>
        <label>To<input type="date" value={filters.to} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/></label>
      </div>
      {loading&&<p className="muted">Loading report…</p>}

      <div className="admission-report-sheet" ref={reportRef}>
        <header className="admission-report-header">
          <div className="admission-report-logo">{c.logoUrl?<img src={c.logoUrl} alt="College logo"/>:<span>LOGO</span>}</div>
          <div className="admission-report-identity"><h1>{c.name||'College'}</h1>{c.educationalSlogan&&<div className="slogan">{c.educationalSlogan}</div>}<h2>{reportTitle()}</h2><p>{subtitle()}</p></div>
          <div/>
        </header>
        {(c.address||c.contactNo||c.email||c.website)&&<div className="admission-report-contact">{[c.address,c.contactNo,c.email,c.website].filter(Boolean).join(' • ')}</div>}
        <div className="admission-report-kpis">
          <div><span>Inquiries</span><strong>{data.counts?.inquiry??0}</strong></div>
          <div><span>Not Interested</span><strong>{data.counts?.notInterested??0}</strong></div>
          <div><span>Form Submitted</span><strong>{data.counts?.formSubmitted??0}</strong></div>
          <div><span>Report Records</span><strong>{data.rows?.length??0}</strong></div>
        </div>
        <div className="admission-report-table-wrap"><table><thead><tr><th>#</th><th>Inquiry No</th><th>Student / Father</th><th>Contact</th><th>Session</th><th>Wing</th><th>Program / Class</th><th>Status</th><th>Form No</th><th>Date</th><th>Remarks</th></tr></thead><tbody>
          {(data.rows||[]).map((r,i)=><tr key={r._id}><td>{i+1}</td><td>{r.inquiryNo||'—'}</td><td><strong>{r.studentName||'—'}</strong><br/><small>{r.fatherName||'—'}</small></td><td>{r.contactNo||'—'}</td><td>{r.academicSessionId?.name||'—'}</td><td>{r.programId?.wingId?.name||'—'}</td><td>{r.programId?.name||'—'}</td><td>{r.status==='pending'?'Inquiry':r.status==='followed_up'?'Inquiry (Followed Up)':r.status==='not_interested'?'Not Interested':'Form Submitted'}</td><td>{r.admissionApplicationId?.formNo||'—'}</td><td>{date(r.status==='form_submitted'?(r.formSubmittedAt||r.createdAt):r.createdAt)}</td><td>{r.notes||'—'}</td></tr>)}
          {!data.rows?.length&&<tr><td colSpan="11" className="empty">No admissions records for the selected filters.</td></tr>}
        </tbody></table></div>
      </div>
    </section>
  </div>;
}
