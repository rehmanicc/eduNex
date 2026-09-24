import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './attendance.css';
import AttendanceSettings from './AttendanceSettings';

const STATUS_OPTIONS = [
  ['present', 'P', 'Present'],
  ['absent', 'A', 'Absent'],
  ['late', 'Lt', 'Late'],
  ['leave', 'L', 'Leave'],
  ['short_leave', 'SL', 'Short Leave']
];

function today() { return new Date().toISOString().slice(0, 10); }
function idOf(value) { return String(value?._id || value || ''); }
function sessionIdOf(c) { return idOf(c.section?.academicSessionId); }
function programIdOf(c) { return idOf(c.section?.programId || c.program); }
function sectionIdOf(c) { return idOf(c.sectionId || c.section); }
function labelSession(c) { return c.section?.academicSessionId?.name || 'Academic Session'; }
function labelProgram(c) { return c.section?.programId?.name || c.program?.name || 'Class / Program'; }
function labelSection(c) { return c.section?.name || 'Section'; }
function hm(minutes = 0) {
  const n = Number(minutes || 0);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
function contextOptionLabel(c) {
  if (c.type === 'per_period') return `${c.course?.name || 'Period'} • ${hm(c.startMinutes)}-${hm(c.endMinutes)}`;
  if (c.type === 'twice') return c.label || (c.slotKey === 'second_half' ? 'Second Session' : 'First Session');
  return 'Daily Attendance';
}


export default function Attendance() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState(searchParams.get('tab') || 'student');
  const setTab = next => { setTabState(next); setSearchParams(prev => { const copy = new URLSearchParams(prev); copy.set('tab', next); return copy; }); };
  useEffect(() => { const next = searchParams.get('tab') || 'student'; if (next !== tab) setTabState(next); }, [searchParams]);
  const [date, setDate] = useState(today());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [contexts, setContexts] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [programId, setProgramId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [contextKey, setContextKey] = useState('');
  const [students, setStudents] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [originalStatuses, setOriginalStatuses] = useState({});
  const [attendanceByStudent, setAttendanceByStudent] = useState({});
  const [attendanceSession, setAttendanceSession] = useState(null);
  const [contextCanCorrect, setContextCanCorrect] = useState(false);

  const [staffData, setStaffData] = useState({ employees: [], attendanceByEmployee: {} });
  const [staffStatuses, setStaffStatuses] = useState({});
  const [reportType,setReportType]=useState('student');
  const [reportFilters,setReportFilters]=useState({from:today().slice(0,8)+'01',to:today(),academicSessionId:'',programId:'',sectionId:''});
  const [reportData,setReportData]=useState({summary:{},rows:[]});

  const roles = new Set([
    ...(user?.roleCodes || []),
    ...(user?.roles || []).map(role => role?.code || role?.name),
    user?.roleCode,
    user?.role,
    user?.designation
  ].filter(Boolean).map(r => String(r).trim().toLowerCase()));
  const permissions = new Set([...(user?.permissions || []), ...(user?.effectivePermissions || [])]);
  const resolvedRole = String(user?.systemRole || '').trim().toLowerCase();
  const inferredCanCorrect =
    resolvedRole === 'platform_owner' ||
    resolvedRole === 'director' ||
    resolvedRole === 'principal' ||
    resolvedRole === 'admin' ||
    permissions.has('*') ||
    permissions.has('CORRECT_ATTENDANCE') ||
    roles.has('director') ||
    roles.has('principal') ||
    roles.has('admin');
  const canCorrect = contextCanCorrect || inferredCanCorrect;
  const canManageSettings =
    resolvedRole === 'platform_owner' ||
    roles.has('director') ||
    roles.has('principal') ||
    roles.has('admin') ||
    permissions.has('*') ||
    permissions.has('MANAGE_COLLEGE') ||
    permissions.has('CORRECT_ATTENDANCE');

  function clearFeedback() { setError(''); setMessage(''); }
  function showError(e) { setError(e.response?.data?.error || e.message); setMessage(''); }

  async function loadContexts() {
    clearFeedback();
    try {
      const { data } = await api.get('/attendance/contexts', { params: { date } });
      setContexts(data || []);
    } catch (e) { showError(e); }
  }

  useEffect(() => {
    if (tab === 'student') loadContexts();
  }, [tab, date]);

  useEffect(() => {
    setSessionId(''); setProgramId(''); setSectionId(''); setContextKey('');
    setStudents([]); setStatuses({}); setOriginalStatuses({}); setAttendanceByStudent({}); setAttendanceSession(null); setContextCanCorrect(false);
  }, [date]);

  const sessionOptions = useMemo(() => {
    const map = new Map();
    contexts.forEach(c => map.set(sessionIdOf(c), labelSession(c)));
    return [...map.entries()].filter(([id]) => id);
  }, [contexts]);

  const programOptions = useMemo(() => {
    const map = new Map();
    contexts.filter(c => !sessionId || sessionIdOf(c) === sessionId).forEach(c => map.set(programIdOf(c), labelProgram(c)));
    return [...map.entries()].filter(([id]) => id);
  }, [contexts, sessionId]);

  const sectionOptions = useMemo(() => {
    const map = new Map();
    contexts.filter(c => (!sessionId || sessionIdOf(c) === sessionId) && (!programId || programIdOf(c) === programId))
      .forEach(c => map.set(sectionIdOf(c), labelSection(c)));
    return [...map.entries()].filter(([id]) => id);
  }, [contexts, sessionId, programId]);

  const contextOptions = useMemo(() => contexts.filter(c =>
    (!sessionId || sessionIdOf(c) === sessionId) &&
    (!programId || programIdOf(c) === programId) &&
    (!sectionId || sectionIdOf(c) === sectionId)
  ), [contexts, sessionId, programId, sectionId]);

  const selectedContext = useMemo(() => contextOptions.find(c => c.key === contextKey) || null, [contextOptions, contextKey]);
  const needsSlotSelector = contextOptions.length > 1 || contextOptions.some(c => c.type === 'per_period' || c.type === 'twice');

  useEffect(() => {
    if (!sectionId) { setContextKey(''); return; }
    if (contextOptions.length === 1) setContextKey(contextOptions[0].key);
    else if (!contextOptions.some(c => c.key === contextKey)) setContextKey('');
  }, [sectionId, contextOptions, contextKey]);

  useEffect(() => {
    if (selectedContext) openContext(selectedContext);
    else { setStudents([]); setAttendanceSession(null); setContextCanCorrect(false); setStatuses({}); setOriginalStatuses({}); setAttendanceByStudent({}); }
  }, [selectedContext?.key]);

  async function openContext(c) {
    clearFeedback(); setBusy(true);
    try {
      const payload = { date, sectionId: c.sectionId, timetableId: c.timetableId || null, slotKey: c.slotKey };
      const { data } = await api.get('/attendance/context-roster', { params: payload });
      const rows = data.students || [];
      const existing = data.attendanceByStudent || {};
      const next = Object.fromEntries(rows.map(s => [s._id, existing[s._id]?.status || 'present']));
      setStudents(rows);
      setAttendanceByStudent(existing);
      setStatuses(next);
      setOriginalStatuses(next);
      setAttendanceSession(data.session || null);
      setContextCanCorrect(!!data.canCorrect);
    } catch (e) { showError(e); }
    finally { setBusy(false); }
  }

  function markAll(status) {
    if (!students.length || teacherReadOnly) return;
    setStatuses(Object.fromEntries(students.map(s => [s._id, status])));
  }

  const teacherReadOnly = attendanceSession?.status === 'finalized' && !canCorrect;
  const allStatus = status => students.length > 0 && students.every(s => statuses[s._id] === status);

  async function saveStudentAttendance() {
    if (!selectedContext || !students.length) return;
    clearFeedback(); setBusy(true);
    try {
      const payload = { date, sectionId: selectedContext.sectionId, timetableId: selectedContext.timetableId || null, slotKey: selectedContext.slotKey };
      if (attendanceSession?.status === 'finalized') {
        if (!canCorrect) throw new Error('Attendance has already been submitted and is read-only.');
        const changed = students.filter(s => statuses[s._id] !== originalStatuses[s._id]);
        if (!changed.length) {
          setMessage('No attendance changes to save.');
          return;
        }
        const missingRecords = changed.filter(s => !attendanceByStudent[s._id]?._id);
        if (missingRecords.length) throw new Error('One or more attendance records could not be found for correction. Reload the attendance register and try again.');
        await Promise.all(changed.map(s => {
          const attendanceId = attendanceByStudent[s._id]._id;
          return api.put(`/attendance/${attendanceId}/correct`, { status: statuses[s._id], reason: 'Corrected from Attendance Register' });
        }));
        setMessage(`Attendance corrected for ${changed.length} student${changed.length === 1 ? '' : 's'}.`);
      } else {
        await api.post('/attendance/context/mark', {
          ...payload,
          entries: students.map(s => ({ studentId: s._id, status: statuses[s._id] || 'present' }))
        });
        setMessage('Attendance saved. It is now read-only for the class/period teacher.');
      }
      await openContext(selectedContext);
    } catch (e) { showError(e); }
    finally { setBusy(false); }
  }

  async function loadStaff() {
    clearFeedback();
    try {
      const { data } = await api.get('/attendance/staff', { params: { date } });
      setStaffData(data || { employees: [], attendanceByEmployee: {} });
      setStaffStatuses(Object.fromEntries((data.employees || []).map(e => [e._id, data.attendanceByEmployee?.[e._id]?.status || 'present'])));
    } catch (e) { showError(e); }
  }
  useEffect(() => { if (tab === 'staff') loadStaff(); }, [tab, date]);

  async function saveStaffAttendance() {
    clearFeedback(); setBusy(true);
    try {
      await api.post('/attendance/staff', { date, entries: (staffData.employees || []).map(e => ({ employeeId: e._id, status: staffStatuses[e._id] || 'present' })) });
      setMessage('Staff attendance saved.'); await loadStaff();
    } catch (e) { showError(e); }
    finally { setBusy(false); }
  }


  async function loadAttendanceReport(){
    clearFeedback();setBusy(true);
    try{
      const params={from:reportFilters.from,to:reportFilters.to};
      if(reportType==='student'){
        if(reportFilters.academicSessionId)params.academicSessionId=reportFilters.academicSessionId;
        if(reportFilters.programId)params.programId=reportFilters.programId;
        if(reportFilters.sectionId)params.sectionId=reportFilters.sectionId;
      }
      const {data}=await api.get(`/attendance/reports/${reportType}`,{params});
      setReportData(data||{summary:{},rows:[]});
    }catch(e){showError(e);}finally{setBusy(false);}
  }

  return <div className="att-page">
    <div className="att-head"><div><h1>Attendance</h1><p>Teachers mark attendance for their assigned Section or University period. Principal/Admin can review and correct submitted attendance.</p></div></div>

    <div className="module-top-tabs">
      <button className={tab === 'student' ? 'active' : ''} onClick={() => setTab('student')}>Student Attendance</button>
      <button className={tab === 'staff' ? 'active' : ''} onClick={() => setTab('staff')}>Staff Attendance</button>
      <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Reports</button>
      {canManageSettings && <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>}
    </div>

    {error && <p className="att-error">{error}</p>}
    {message && <p className="att-success">{message}</p>}

    {tab === 'student' && <>
      <section className="att-filter-panel">
        <div className="att-filter-row">
          <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>Session<select value={sessionId} onChange={e => { setSessionId(e.target.value); setProgramId(''); setSectionId(''); setContextKey(''); }}><option value="">Select Session</option>{sessionOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Class / Program<select value={programId} disabled={!sessionId} onChange={e => { setProgramId(e.target.value); setSectionId(''); setContextKey(''); }}><option value="">Select Class / Program</option>{programOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Section<select value={sectionId} disabled={!programId} onChange={e => { setSectionId(e.target.value); setContextKey(''); }}><option value="">Select Section</option>{sectionOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {sectionId && needsSlotSelector && <label>{contextOptions.some(c => c.type === 'per_period') ? 'Period / Subject' : 'Attendance Session'}<select value={contextKey} onChange={e => setContextKey(e.target.value)}><option value="">Select...</option>{contextOptions.map(c => <option key={c.key} value={c.key}>{contextOptionLabel(c)}</option>)}</select></label>}
        </div>
      </section>

      {!contexts.length && <div className="att-empty">No attendance classes are available for this date. Check Section Class Teacher allocation, University timetable assignments, and Attendance Rules.</div>}

      {selectedContext && <section className="att-panel">
        <div className="att-panel-title">
          <div><h2>{labelProgram(selectedContext)} / {labelSection(selectedContext)}</h2><p>{contextOptionLabel(selectedContext)} • Status: <strong>{attendanceSession?.status || 'not submitted'}</strong></p></div>
          <div className={`att-lock ${teacherReadOnly ? 'locked' : attendanceSession?.status === 'finalized' && canCorrect ? 'correction' : ''}`}>{teacherReadOnly ? 'Submitted • View Only' : attendanceSession?.status === 'finalized' && canCorrect ? 'Submitted • Admin Correction' : 'Ready to Mark'}</div>
        </div>

        <div className="att-table-wrap"><table className="att-table att-register"><thead><tr>
          <th>Roll / Admission No</th><th>Student</th><th>Father Name</th>
          {STATUS_OPTIONS.map(([value, code, label]) => <th className="att-status-col" key={value}><label title={`Mark all ${label}`}><span>{code}</span><input type="checkbox" checked={allStatus(value)} disabled={teacherReadOnly || !students.length} onChange={() => markAll(value)} /></label></th>)}
        </tr></thead><tbody>
          {students.map(s => <tr key={s._id}><td>{s.rollNo || s.admissionNo || '—'}</td><td>{s.name}</td><td>{s.fatherName || '—'}</td>{STATUS_OPTIONS.map(([value, code]) => <td className="att-status-cell" key={value}><input aria-label={`${s.name} ${code}`} type="radio" name={`attendance-${s._id}`} checked={(statuses[s._id] || 'present') === value} disabled={teacherReadOnly} onChange={() => setStatuses(prev => ({ ...prev, [s._id]: value }))} /></td>)}</tr>)}
          {!students.length && <tr><td colSpan="8" className="att-empty-cell">No active students found in this section.</td></tr>}
        </tbody></table></div>

        <div className="att-register-footer"><span>P Present • A Absent • Lt Late • L Leave • SL Short Leave</span><button onClick={saveStudentAttendance} disabled={busy || teacherReadOnly || !students.length}>{attendanceSession?.status === 'finalized' && canCorrect ? 'Save Corrections' : 'Save Attendance'}</button></div>
      </section>}
    </>}

    {tab === 'staff' && <section className="att-panel">
      <div className="att-panel-title"><div><h2>Staff Attendance</h2><p>Daily staff attendance. Biometric devices, employee PIN mapping, imports and raw logs are managed only in the separate Biometric module.</p></div><label className="att-inline-date">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label></div>
      <div className="att-table-wrap"><table className="att-table"><thead><tr><th>Employee</th><th>Designation</th><th>Duty Shift</th><th>IN</th><th>OUT</th><th>Source</th><th>Status</th></tr></thead><tbody>{(staffData.employees || []).map(e => { const a = staffData.attendanceByEmployee?.[e._id]; const shift=staffData.shiftByEmployee?.[e._id]; const closure=staffData.closureByEmployee?.[e._id]; return <tr key={e._id}><td>{e.employeeNo} - {e.name}</td><td>{e.designationId?.name || e.designation || '—'}</td><td>{closure?<span className="att-off-badge" title={closure.title}>OFF • {closure.title}</span>:shift?`${shift.name} (${hm(shift.startMinutes)}-${hm(shift.endMinutes)})`:'No shift'}</td><td>{a?.checkInTime ? new Date(a.checkInTime).toLocaleTimeString() : '—'}</td><td>{a?.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString() : '—'}</td><td><span className={`att-source ${a?.source||'manual'}`}>{a?.source || 'manual'}</span></td><td>{closure?<strong>OFF</strong>:<select value={staffStatuses[e._id] || 'present'} onChange={ev => setStaffStatuses(prev => ({ ...prev, [e._id]: ev.target.value }))}>{STATUS_OPTIONS.map(([value, code, label]) => <option key={value} value={value}>{code} - {label}</option>)}</select>}</td></tr>; })}{!(staffData.employees||[]).length&&<tr><td colSpan="7" className="att-empty-cell">No active employees found.</td></tr>}</tbody></table></div>
      <div className="att-register-footer"><span>Biometric IN/OUT is processed automatically. Manual changes are retained as authorized overrides.</span><button onClick={saveStaffAttendance} disabled={busy}>Save Staff Attendance</button></div>
    </section>}

    {tab === 'reports' && <section className="cms-report-workspace att-report-workspace">
      <div className="cms-report-head"><div><h2>Attendance Reports</h2><p>Review and print student or staff attendance summaries for a selected date range.</p></div><button type="button" onClick={()=>window.print()}>Print Report</button></div>
      <div className="att-report-type-tabs"><button className={reportType==='student'?'active':''} onClick={()=>{setReportType('student');setReportData({summary:{},rows:[]});}}>Student Attendance</button><button className={reportType==='staff'?'active':''} onClick={()=>{setReportType('staff');setReportData({summary:{},rows:[]});}}>Staff Attendance</button></div>
      <div className="cms-report-filterbar">
        <label><span>From</span><input type="date" value={reportFilters.from} onChange={e=>setReportFilters({...reportFilters,from:e.target.value})}/></label>
        <label><span>To</span><input type="date" value={reportFilters.to} onChange={e=>setReportFilters({...reportFilters,to:e.target.value})}/></label>
        {reportType==='student'&&<><label><span>Session</span><select value={reportFilters.academicSessionId} onChange={e=>setReportFilters({...reportFilters,academicSessionId:e.target.value,sectionId:''})}><option value="">All Sessions</option>{sessionOptions.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label><span>Program</span><select value={reportFilters.programId} onChange={e=>setReportFilters({...reportFilters,programId:e.target.value,sectionId:''})}><option value="">All Programs</option>{programOptions.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label><span>Section</span><select value={reportFilters.sectionId} onChange={e=>setReportFilters({...reportFilters,sectionId:e.target.value})}><option value="">All Sections</option>{sectionOptions.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></>}
        <button type="button" onClick={loadAttendanceReport} disabled={busy}>Generate Report</button>
      </div>
      <div className="cms-report-kpis">
        <div className="cms-report-kpi"><span>{reportType==='student'?'Students':'Staff'}</span><strong>{reportData.summary?.students??reportData.summary?.staff??0}</strong></div>
        <div className="cms-report-kpi"><span>Attendance %</span><strong>{reportData.summary?.attendancePercentage||0}%</strong></div>
        <div className="cms-report-kpi"><span>Present</span><strong>{reportData.summary?.present||0}</strong></div>
        <div className="cms-report-kpi"><span>Late</span><strong>{reportData.summary?.late||0}</strong></div>
        <div className="cms-report-kpi"><span>Absent</span><strong>{reportData.summary?.absent||0}</strong></div>
        <div className="cms-report-kpi"><span>Leave / SL</span><strong>{Number(reportData.summary?.leave||0)+Number(reportData.summary?.short_leave||0)}</strong></div>
      </div>
      <div className="cms-report-table-card"><div className="cms-report-table-title"><div><h3>{reportType==='student'?'Student Attendance Summary':'Staff Attendance Summary'}</h3><p>{reportFilters.from} to {reportFilters.to}</p></div></div><div className="cms-report-table-wrap"><table><thead><tr>{reportType==='student'?<><th>Roll No</th><th>Student</th><th>Father Name</th><th>Program</th><th>Section</th></>:<><th>Employee No</th><th>Employee</th><th>Designation</th><th>Branch</th></>}<th>P</th><th>Lt</th><th>A</th><th>L</th><th>SL</th><th>Total</th><th>Attendance %</th></tr></thead><tbody>{(reportData.rows||[]).map(r=><tr key={r.studentId||r.employeeId}>{reportType==='student'?<><td>{r.rollNo}</td><td>{r.name}</td><td>{r.fatherName}</td><td>{r.program}</td><td>{r.section}</td></>:<><td>{r.employeeNo}</td><td>{r.name}</td><td>{r.designation}</td><td>{r.branch}</td></>}<td>{r.present}</td><td>{r.late}</td><td>{r.absent}</td><td>{r.leave}</td><td>{r.short_leave}</td><td>{r.total}</td><td><strong>{r.attendancePercentage}%</strong></td></tr>)}{!reportData.rows?.length&&<tr><td className="cms-report-empty" colSpan="12">Generate a report to view attendance records.</td></tr>}</tbody></table></div></div>
    </section>}

    {tab === 'settings' && canManageSettings && <AttendanceSettings/>}
  </div>;
}
