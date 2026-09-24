import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import * as XLSX from 'xlsx';
import './biometric.css';

const VENDORS=[
  ['zkteco','ZKTeco'],['hikvision','Hikvision'],['anviz','Anviz'],['essl','eSSL'],
  ['suprema','Suprema'],['matrix','Matrix'],['generic','Generic']
];

const COLUMN_ALIASES={
  biometricUserId:['user id','userid','user_id','pin','employee id','employeeid','enroll number','enrollnumber','enrollment no','ac-no.','ac no','person id','personid','id'],
  eventTime:['date/time','datetime','date time','timestamp','check time','checktime','punch time','punchtime','record time','recordtime'],
  date:['date','attendance date','record date'],
  time:['time','attendance time'],
  punchType:['punch','punch type','state','status','in/out','inout','check type','checktype'],
  verifyMode:['verify','verify mode','verification','verification mode']
};

function norm(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');}
function first(row,aliases){
  const entries=Object.entries(row||{});
  for(const alias of aliases){
    const hit=entries.find(([key])=>norm(key)===alias);
    if(hit&&hit[1]!==''&&hit[1]!==undefined&&hit[1]!==null)return hit[1];
  }
  return '';
}
function normalizeRows(rawRows){
  return (rawRows||[]).map(row=>{
    const biometricUserId=first(row,COLUMN_ALIASES.biometricUserId);
    let eventTime=first(row,COLUMN_ALIASES.eventTime);
    if(!eventTime){
      const date=first(row,COLUMN_ALIASES.date),time=first(row,COLUMN_ALIASES.time);
      eventTime=date&&time?`${date} ${time}`:(date||time);
    }
    return {biometricUserId:String(biometricUserId||'').trim(),eventTime,punchType:first(row,COLUMN_ALIASES.punchType),verifyMode:first(row,COLUMN_ALIASES.verifyMode)};
  }).filter(row=>row.biometricUserId||row.eventTime);
}
function minutes(value){const[h,m]=String(value||'00:00').split(':').map(Number);return Math.max(0,Math.min(1439,(h||0)*60+(m||0)));}
function hm(value){const n=Number(value||0);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function today(){return new Date().toISOString().slice(0,10);}
function errText(e){return e.response?.data?.error||e.message||'Something went wrong';}

export default function Biometric(){
  const [devices,setDevices]=useState([]);
  const [events,setEvents]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [selectedDeviceId,setSelectedDeviceId]=useState('');
  const [mappings,setMappings]=useState({});
  const [date,setDate]=useState(today());
  const [tab,setTab]=useState('devices');
  const [showDeviceForm,setShowDeviceForm]=useState(false);
  const [deviceForm,setDeviceForm]=useState({name:'',vendor:'zkteco',model:'',deviceCode:'',location:'',ipAddress:'',integrationType:'both'});
  const [importRows,setImportRows]=useState([]);
  const [fileName,setFileName]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  const selectedDevice=useMemo(()=>devices.find(d=>d._id===selectedDeviceId)||null,[devices,selectedDeviceId]);
  const summary=useMemo(()=>({
    total:events.length,
    processed:events.filter(e=>e.processingStatus==='processed').length,
    ignored:events.filter(e=>e.processingStatus==='ignored').length,
    errors:events.filter(e=>['error','duplicate'].includes(e.processingStatus)).length
  }),[events]);

  function feedback(){setError('');setMessage('');}
  async function load(){
    feedback();
    try{
      const [healthRes,eventRes,staffRes]=await Promise.all([
        api.get('/biometric/health'),
        api.get('/biometric/events',{params:{date,limit:500}}),
        api.get('/attendance/staff',{params:{date}})
      ]);
      const nextDevices=healthRes.data||[];
      setDevices(nextDevices);
      setEvents(eventRes.data||[]);
      setEmployees(staffRes.data?.employees||[]);
      const selected=selectedDeviceId||nextDevices[0]?._id||'';
      if(selected&&!selectedDeviceId)setSelectedDeviceId(selected);
      if(selected){
        const {data}=await api.get('/biometric/staff-mappings',{params:{deviceId:selected}});
        setMappings(Object.fromEntries((data||[]).map(row=>[row.personId?._id||row.personId,row.biometricUserId])));
      }
    }catch(e){setError(errText(e));}
  }
  useEffect(()=>{load();},[date]);
  useEffect(()=>{
    if(!selectedDeviceId)return;
    api.get('/biometric/staff-mappings',{params:{deviceId:selectedDeviceId}})
      .then(({data})=>setMappings(Object.fromEntries((data||[]).map(row=>[row.personId?._id||row.personId,row.biometricUserId]))))
      .catch(e=>setError(errText(e)));
  },[selectedDeviceId]);

  async function saveDevice(e){
    e.preventDefault();feedback();setBusy(true);
    try{
      const payload={...deviceForm,serialNumber:deviceForm.deviceCode};
      const {data}=await api.post('/biometric/devices',payload);
      setMessage('Biometric device saved.');
      setShowDeviceForm(false);setSelectedDeviceId(data._id);
      setDeviceForm({name:'',vendor:'zkteco',model:'',deviceCode:'',location:'',ipAddress:'',integrationType:'both'});
      await load();
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  }

  async function saveMapping(employeeId){
    const biometricUserId=String(mappings[employeeId]||'').trim();
    if(!selectedDeviceId||!biometricUserId){setError('Select a device and enter the Biometric User ID / PIN.');return;}
    feedback();setBusy(true);
    try{
      await api.put('/biometric/staff-mappings',{deviceId:selectedDeviceId,employeeId,biometricUserId});
      setMessage('Employee biometric ID saved.');
      await load();
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  }

  async function readFile(file){
    feedback();if(!file)return;
    try{
      const buffer=await file.arrayBuffer();
      const wb=XLSX.read(buffer,{type:'array',cellDates:true});
      const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:false});
      const rows=normalizeRows(raw);
      setFileName(file.name);setImportRows(rows);
      if(!rows.length)setError('No recognizable punch rows found. Expected User ID/PIN and Date-Time columns.');
      else setMessage(`${rows.length} punch rows detected. Review and import.`);
    }catch(e){setError(`Could not read biometric file: ${e.message}`);}
  }

  async function importFile(){
    if(!selectedDeviceId){setError('Select a biometric device first.');return;}
    if(!importRows.length){setError('Choose a biometric export file first.');return;}
    feedback();setBusy(true);
    try{
      const {data}=await api.post('/biometric/import',{deviceId:selectedDeviceId,rows:importRows});
      setMessage(`Import complete: ${data.imported} new, ${data.duplicates} duplicate, ${data.processed} processed, ${data.ignored} ignored.${data.invalid?.length?` ${data.invalid.length} invalid row(s).`:''}`);
      setImportRows([]);setFileName('');
      await load();
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  }

  return <div className="biometric-page">
    <div className="biometric-head"><div><h1>Biometric</h1><p>Single place for biometric device configuration, employee PIN mapping, imports, device health and raw logs.</p></div><button onClick={load}>Refresh</button></div>
    {error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}
    <div className="module-top-tabs"><button className={tab==='devices'?'active':''} onClick={()=>setTab('devices')}>Devices</button><button className={tab==='mappings'?'active':''} onClick={()=>setTab('mappings')}>Employee IDs</button><button className={tab==='import'?'active':''} onClick={()=>setTab('import')}>Import Punches</button><button className={tab==='logs'?'active':''} onClick={()=>setTab('logs')}>Raw Logs</button></div>

    <div className="biometric-kpis"><div><span>Devices</span><strong>{devices.length}</strong></div><div><span>Punches</span><strong>{summary.total}</strong></div><div><span>Processed</span><strong>{summary.processed}</strong></div><div><span>Ignored / Error</span><strong>{summary.ignored+summary.errors}</strong></div></div>

    {tab==='devices'&&<section className="biometric-card">
      <div className="biometric-card-head"><div><h2>Biometric Devices</h2><p>Works with ZKTeco and other common machines using file exports or connector/API integration. Staff timing rules are configured in Attendance → Settings.</p></div><button onClick={()=>setShowDeviceForm(v=>!v)}>{showDeviceForm?'Close':'+ Add Device'}</button></div>
      {showDeviceForm&&<form className="biometric-device-form" onSubmit={saveDevice}>
        <label><span>Device Name *</span><input required value={deviceForm.name} onChange={e=>setDeviceForm({...deviceForm,name:e.target.value})}/></label>
        <label><span>Vendor</span><select value={deviceForm.vendor} onChange={e=>setDeviceForm({...deviceForm,vendor:e.target.value})}>{VENDORS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label><span>Model</span><input value={deviceForm.model} onChange={e=>setDeviceForm({...deviceForm,model:e.target.value})}/></label>
        <label><span>Device Code / Serial *</span><input required value={deviceForm.deviceCode} onChange={e=>setDeviceForm({...deviceForm,deviceCode:e.target.value.toUpperCase()})}/></label>
        <label><span>Location</span><input value={deviceForm.location} onChange={e=>setDeviceForm({...deviceForm,location:e.target.value})}/></label>
        <label><span>IP Address</span><input value={deviceForm.ipAddress} onChange={e=>setDeviceForm({...deviceForm,ipAddress:e.target.value})}/></label>
        <label><span>Integration</span><select value={deviceForm.integrationType} onChange={e=>setDeviceForm({...deviceForm,integrationType:e.target.value})}><option value="both">File + API</option><option value="file">File Import</option><option value="push">Push</option><option value="poll">Poll / Connector</option><option value="api">API</option></select></label>
        
        
        
        
        
        <button disabled={busy}>Save Device</button>
      </form>}
      <div className="biometric-device-list">{devices.map(d=><button key={d._id} className={selectedDeviceId===d._id?'active':''} onClick={()=>setSelectedDeviceId(d._id)}><strong>{d.name}</strong><span>{String(d.vendor||'generic').toUpperCase()} {d.model||''} • {d.deviceCode||d.serialNumber} • {d.healthStatus}</span><small>{d.location||'No location'}</small></button>)}{!devices.length&&<p>No devices configured.</p>}</div>
    </section>}

    {tab==='mappings'&&<section className="biometric-card">
      <div className="biometric-card-head"><div><h2>Employee Biometric IDs</h2><p>Select a device and map the User ID / PIN stored on that machine to each employee.</p></div><select value={selectedDeviceId} onChange={e=>setSelectedDeviceId(e.target.value)}><option value="">Select Device</option>{devices.map(d=><option key={d._id} value={d._id}>{d.name}</option>)}</select></div>
      <table><thead><tr><th>Employee</th><th>Designation</th><th>Biometric User ID / PIN</th><th>Action</th></tr></thead><tbody>{employees.map(emp=><tr key={emp._id}><td>{emp.employeeNo} - {emp.name}</td><td>{emp.designationId?.name||emp.designation||'—'}</td><td><input value={mappings[emp._id]||''} onChange={e=>setMappings(prev=>({...prev,[emp._id]:e.target.value}))}/></td><td><button disabled={!selectedDeviceId||!mappings[emp._id]||busy} onClick={()=>saveMapping(emp._id)}>Save</button></td></tr>)}</tbody></table>
    </section>}

    {tab==='import'&&<section className="biometric-card">
      <div className="biometric-card-head"><div><h2>Import Biometric Punches</h2><p>Import Excel/CSV/TXT-style exports. Common User ID/PIN and Date-Time column names are recognized automatically.</p></div><select value={selectedDeviceId} onChange={e=>setSelectedDeviceId(e.target.value)}><option value="">Select Device</option>{devices.map(d=><option key={d._id} value={d._id}>{d.name}</option>)}</select></div>
      <div className="biometric-import-row"><input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={e=>readFile(e.target.files?.[0])}/><span>{fileName||'No file selected'}</span><button disabled={!selectedDeviceId||!importRows.length||busy} onClick={importFile}>Import & Process</button></div>
      {!!importRows.length&&<table><thead><tr><th>#</th><th>User ID</th><th>Date / Time</th><th>Punch</th></tr></thead><tbody>{importRows.slice(0,20).map((r,i)=><tr key={i}><td>{i+1}</td><td>{r.biometricUserId||'—'}</td><td>{String(r.eventTime||'—')}</td><td>{String(r.punchType||'unknown')}</td></tr>)}</tbody></table>}
    </section>}

    {tab==='logs'&&<section className="biometric-card">
      <div className="biometric-card-head"><div><h2>Raw Biometric Logs</h2><p>Original device punches and their processing result.</p></div><label>Date <input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
      <table><thead><tr><th>Date / Time</th><th>Device</th><th>User ID</th><th>Employee</th><th>Status</th><th>Kind</th><th>Message</th></tr></thead><tbody>{events.map(ev=><tr key={ev._id}><td>{new Date(ev.eventTime).toLocaleString()}</td><td>{ev.deviceId?.name||'—'}</td><td>{ev.biometricUserId}</td><td>{ev.employee?`${ev.employee.employeeNo||ev.employee.employeeCode||''} ${ev.employee.name||''}`:'—'}</td><td>{ev.processingStatus}</td><td>{ev.eventKind}</td><td>{ev.processingMessage||'—'}</td></tr>)}{!events.length&&<tr><td colSpan="7">No biometric events found.</td></tr>}</tbody></table>
    </section>}
  </div>;
}
