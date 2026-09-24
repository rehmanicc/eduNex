import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import './admissions-modal.css';
import AdmissionsModuleNav from './AdmissionsModuleNav';
import Pagination, { usePagination } from '../../components/Pagination';
import AdmissionFilter from './AdmissionFilter';
import ResultFields from './ResultFields';
import { REFERENCE_OPTIONS, blankInquiry, inquiryStatuses, getError, idOf, resultRules, alignResults, nearestMatches } from './admissionsUtils';

export default function InquiriesPage(){
  const navigate=useNavigate();
  const [inquiryStatus,setInquiryStatus]=useState('pending');
  const [inquiries,setInquiries]=useState([]);
  const [programs,setPrograms]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [inquiryForm,setInquiryForm]=useState(blankInquiry);
  const [showInquiryModal,setShowInquiryModal]=useState(false);
  const [followUpRow,setFollowUpRow]=useState(null);
  const [followUpForm,setFollowUpForm]=useState({followUpDate:new Date().toISOString().slice(0,10),remarks:''});
  const [notInterestedRow,setNotInterestedRow]=useState(null);
  const [notInterestedRemarks,setNotInterestedRemarks]=useState('');
  const [historyRow,setHistoryRow]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [filterField,setFilterField]=useState('studentName');
  const [filterValue,setFilterValue]=useState('');

  const selectedInquiryProgram=useMemo(()=>programs.find(p=>idOf(p)===inquiryForm.programId),[programs,inquiryForm.programId]);
  const inquiryRules=useMemo(()=>resultRules(selectedInquiryProgram),[selectedInquiryProgram]);
  const filteredInquiries=useMemo(()=>nearestMatches(inquiries,filterField,filterValue),[inquiries,filterField,filterValue]);
  const inquiryPager=usePagination(filteredInquiries, `${filterField}|${filterValue}`);

  async function loadLookups(){
    const [programRes,sessionRes]=await Promise.all([
      api.get('/academics/programs'),
      api.get('/academics/sessions')
    ]);
    setPrograms(programRes.data||[]);
    setSessions(sessionRes.data||[]);
  }
  function freshInquiry(){
    const current=sessions.find(s=>s.isCurrent)||null;
    return {...blankInquiry,academicSessionId:current?._id||''};
  }
  async function loadInquiries(status=inquiryStatus){
    if(status==='pending'){
      const [pendingRes,followedRes]=await Promise.all([
        api.get('/admissions/inquiries?status=pending'),
        api.get('/admissions/inquiries?status=followed_up')
      ]);
      setInquiries([...(pendingRes.data||[]),...(followedRes.data||[])]);
      return;
    }
    const res=await api.get(`/admissions/inquiries?status=${encodeURIComponent(status)}`);
    setInquiries(res.data||[]);
  }
  useEffect(()=>{loadLookups().catch(e=>setError(getError(e)));},[]);
  useEffect(()=>{loadInquiries().catch(e=>setError(getError(e)));},[inquiryStatus]);

  function setInquiryProgram(programId) {
    const program = programs.find(p => idOf(p) === programId);
    const rules = resultRules(program);

    setInquiryForm(prev => ({
      ...prev,
      programId,
      previousResults: alignResults([], rules)
    }));
  }

  function updateInquiryResult(index, field, value) {
    setInquiryForm(prev => ({
      ...prev,
      previousResults: prev.previousResults.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
    }));
  }

  async function addInquiry(e, forceDuplicate = false) {
    if (e) e.preventDefault();

    setBusy(true);
    setError('');

    try {
      await api.post('/admissions/inquiries', {
        ...inquiryForm,
        previousResults: inquiryForm.previousResults.map(row => ({
          ...row,
          obtainedMarks:
            row.obtainedMarks === '' ? undefined : Number(row.obtainedMarks),
          totalMarks:
            row.totalMarks === '' ? undefined : Number(row.totalMarks)
        })),
        forceDuplicate
      });

      setInquiryForm(freshInquiry());
      setShowInquiryModal(false);
      setInquiryStatus('pending');
      await loadInquiries('pending');
    } catch (e2) {
      if (
        e2.response?.status === 409 &&
        e2.response?.data?.code === 'DUPLICATE_INQUIRY'
      ) {
        const first = e2.response.data.duplicates?.[0];

        const msg = first
          ? `Possible duplicate found:\n\n${first.inquiryNo}\n${first.studentName}\n${first.contactNo}\nStatus: ${first.status}\n\nCreate anyway?`
          : 'Possible duplicate inquiry found. Create anyway?';

        if (window.confirm(msg)) {
          setBusy(false);
          return addInquiry(null, true);
        }
      } else {
        setError(getError(e2));
      }
    } finally {
      setBusy(false);
    }
  }

  function openFollowUp(row) {
    setFollowUpRow(row);
    setFollowUpForm({
      followUpDate: new Date().toISOString().slice(0, 10),
      remarks: ''
    });
    setNotInterestedRow(null);
  }

  async function saveFollowUp(e) {
    e.preventDefault();
    if (!followUpRow) return;

    setBusy(true);
    setError('');

    try {
      await api.post(`/admissions/inquiries/${followUpRow._id}/status`, {
        status: 'followed_up',
        followUpDate: followUpForm.followUpDate,
        remarks: followUpForm.remarks.trim()
      });

      setFollowUpRow(null);
      setInquiryStatus('pending');
      await loadInquiries('pending');
    } catch (e2) {
      setError(getError(e2));
    } finally {
      setBusy(false);
    }
  }

  function openNotInterested(row) {
    setNotInterestedRow(row);
    setNotInterestedRemarks('');
    setFollowUpRow(null);
  }

  async function markNotInterested(e) {
    e.preventDefault();
    if (!notInterestedRow) return;

    setBusy(true);
    setError('');

    try {
      await api.post(`/admissions/inquiries/${notInterestedRow._id}/status`, {
        status: 'not_interested',
        remarks: notInterestedRemarks.trim()
      });

      setNotInterestedRow(null);
      setInquiryStatus('not_interested');
      await loadInquiries('not_interested');
    } catch (e2) {
      setError(getError(e2));
    } finally {
      setBusy(false);
    }
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  async function admitInquiry(row) {
    let academicSessionId=idOf(row.academicSessionId);
    let assignedLegacySession=null;

    if(!academicSessionId){
      assignedLegacySession=sessions.find(s=>s.isCurrent)||(sessions.length===1?sessions[0]:null);
      if(!assignedLegacySession){
        setError('This older Inquiry has no Academic Session. Please create/mark the current Academic Session first, then try Prospectus / Form again.');
        return;
      }
      academicSessionId=idOf(assignedLegacySession);
    }

    const legacyNote=assignedLegacySession
      ? `\n\nThis older Inquiry has no Session. ${assignedLegacySession.name} will be assigned before issuing the Form / Prospectus.`
      : '';

    if (!window.confirm(`Move ${row.studentName} to Prospectus / Form and Admission Office?${legacyNote}`)) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/admissions/inquiries/${row._id}/submit-form`,{academicSessionId});
      await loadInquiries('form_submitted');
      navigate('/admissions/admissions');
    } catch (e) {
      setError(getError(e));
    } finally {
      setBusy(false);
    }
  }

  return <div className="admissions-workspace">
    <AdmissionsModuleNav/>
    <section className="admissions-page-content">
      {error&&<p className="error">{error}</p>}
      <>
        <h2>Inquiries</h2>
        <p className="muted">
          FDO workflow: Pending → Prospectus / Form. Follow-ups remain part of the Pending inquiry history; Not Interested closes the inquiry.
        </p>

        <div className="admission-toolbar">
          <button
            type="button"
            className="admission-primary-action"
            onClick={() => {
              setInquiryForm(freshInquiry());
              setError('');
              setShowInquiryModal(true);
            }}
          >
            + New Inquiry
          </button>
        </div>

        <div className="admission-tabs-filter-row">
          <div className="tabs">
            {inquiryStatuses.map(([value, label]) => (
              <button
                key={value}
                className={inquiryStatus === value ? 'active' : ''}
                onClick={() => setInquiryStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <AdmissionFilter field={filterField} value={filterValue} onFieldChange={setFilterField} onValueChange={setFilterValue}/>
        </div>

        <table>
          <thead>
            <tr>
              <th>Inquiry</th>
              <th>Student</th>
              <th>Father Name</th>
              <th>Contact</th>
              <th>Class / Program</th>
              <th>Session</th>
              {inquiryStatus === 'pending' && <th>Attempts</th>}
              {inquiryStatus === 'pending' && <th>Last Follow-Up</th>}
              <th>Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {inquiryPager.rows.map(row => {
              const latestFollowUp = row.followUps?.length
                ? row.followUps[row.followUps.length - 1]
                : null;

              const attemptCount =
                row.followUps?.length ||
                (row.status === 'followed_up' && row.followUpDate ? 1 : 0);

              const remarks =
                latestFollowUp?.remarks ||
                row.notes ||
                '—';

              return (
                <tr key={row._id}>
                  <td>{row.inquiryNo}</td>

                  <td>{row.studentName}</td>
                  <td>{row.fatherName || '—'}</td>
                  <td>{row.contactNo || '—'}</td>
                  <td>{row.programId?.name || ''}</td>
                  <td>{row.academicSessionId?.name || '—'}</td>

                  {inquiryStatus === 'pending' && (
                    <td>{attemptCount}</td>
                  )}

                  {inquiryStatus === 'pending' && (
                    <td>
                      {formatDate(
                        latestFollowUp?.followUpDate ||
                        row.followUpDate
                      )}
                      {attemptCount > 0 && (
                        <button
                          type="button"
                          style={{ marginLeft: 8 }}
                          onClick={() => setHistoryRow(row)}
                        >
                          History
                        </button>
                      )}
                    </td>
                  )}

                  <td>{remarks}</td>

                  <td className="row-actions">
                    {row.status === 'pending' && (
                      <>
                        <button onClick={() => openFollowUp(row)}>Follow Up</button>
                        <button onClick={() => admitInquiry(row)}>Prospectus / Form</button>
                      </>
                    )}

                    {row.status === 'followed_up' && (
                      <>
                        <button onClick={() => openFollowUp(row)}>Follow Up</button>
                        <button
                          className="danger"
                          onClick={() => openNotInterested(row)}
                        >
                          Not Interested
                        </button>
                        <button onClick={() => admitInquiry(row)}>Prospectus / Form</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}

            {!filteredInquiries.length && (
              <tr>
                <td colSpan={inquiryStatus === 'pending' ? 10 : 8}>
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination {...inquiryPager} />

        {showInquiryModal && (
          <div
            className="admission-modal-backdrop"
            onMouseDown={e => {
              if (e.target === e.currentTarget && !busy) {
                setShowInquiryModal(false);
              }
            }}
          >
            <div
              className="admission-modal admission-modal-large"
              role="dialog"
              aria-modal="true"
            >
              <div className="admission-modal-header">
                <div>
                  <h3>New Inquiry</h3>
                  <p>
                    Select the Class / Program first to load the correct result requirements.
                  </p>
                </div>

                <button
                  type="button"
                  className="admission-modal-close"
                  onClick={() => setShowInquiryModal(false)}
                  disabled={busy}
                >
                  ×
                </button>
              </div>

              <form className="admission-modal-form" onSubmit={addInquiry}>
                <label>
                  <span>Session *</span>
                  <select
                    required
                    value={inquiryForm.academicSessionId}
                    onChange={e=>setInquiryForm({...inquiryForm,academicSessionId:e.target.value})}
                  >
                    <option value="">Select Session</option>
                    {sessions.map(session=>(
                      <option key={session._id} value={session._id}>
                        {session.name}{session.isCurrent?' (Current)':''}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Student Name *</span>
                  <input
                    required
                    autoFocus
                    value={inquiryForm.studentName}
                    onChange={e=>setInquiryForm({...inquiryForm,studentName:e.target.value})}
                  />
                </label>

                <label>
                  <span>Father Name</span>
                  <input
                    value={inquiryForm.fatherName}
                    onChange={e=>setInquiryForm({...inquiryForm,fatherName:e.target.value})}
                  />
                </label>

                <label>
                  <span>Contact No *</span>
                  <input
                    required
                    value={inquiryForm.contactNo}
                    onChange={e=>setInquiryForm({...inquiryForm,contactNo:e.target.value})}
                  />
                </label>

                <label>
                  <span>Class / Program *</span>
                  <select
                    required
                    value={inquiryForm.programId}
                    onChange={e=>setInquiryProgram(e.target.value)}
                  >
                    <option value="">Select Class / Program</option>
                    {programs.map(program=>(
                      <option key={program._id} value={program._id}>{program.name}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Previous School</span>
                  <input
                    value={inquiryForm.previousSchool}
                    onChange={e=>setInquiryForm({...inquiryForm,previousSchool:e.target.value})}
                  />
                </label>

                <label>
                  <span>Address</span>
                  <input
                    value={inquiryForm.address}
                    onChange={e=>setInquiryForm({...inquiryForm,address:e.target.value})}
                  />
                </label>

                <label>
                  <span>Reference *</span>
                  <select
                    required
                    value={inquiryForm.referenceType}
                    onChange={e=>setInquiryForm({
                      ...inquiryForm,
                      referenceType:e.target.value,
                      referenceDetail:['student','staff','other'].includes(e.target.value)
                        ? inquiryForm.referenceDetail
                        : ''
                    })}
                  >
                    <option value="">Select Reference</option>
                    {REFERENCE_OPTIONS.map(([value,label])=>(
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                {['student','staff','other'].includes(inquiryForm.referenceType) ? (
                  <label>
                    <span>Reference Detail *</span>
                    <input
                      required
                      placeholder={
                        inquiryForm.referenceType==='student'
                          ? 'Student name or roll no.'
                          : inquiryForm.referenceType==='staff'
                            ? 'Staff name'
                            : 'Reference detail'
                      }
                      value={inquiryForm.referenceDetail}
                      onChange={e=>setInquiryForm({...inquiryForm,referenceDetail:e.target.value})}
                    />
                  </label>
                ) : (
                  <div className="inquiry-form-grid-placeholder" aria-hidden="true"/>
                )}

                <ResultFields rows={inquiryForm.previousResults} rules={inquiryRules} onChange={updateInquiryResult} showBoardRoll/>

                <div className="admission-modal-actions">
                  <button
                    type="button"
                    className="admission-secondary-action"
                    onClick={() => setShowInquiryModal(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="admission-primary-action"
                    disabled={busy}
                  >
                    {busy ? 'Saving...' : 'Save Inquiry'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {followUpRow && (
          <div className="panel" style={{ marginTop: 24 }}>
            <h3>
              Follow-Up Attempt #{(followUpRow.followUps?.length || 0) + 1} - {followUpRow.studentName}
            </h3>

            <form className="inline-form" onSubmit={saveFollowUp}>
              <input
                required
                type="date"
                value={followUpForm.followUpDate}
                onChange={e =>
                  setFollowUpForm({
                    ...followUpForm,
                    followUpDate: e.target.value
                  })
                }
              />

              <input
                required
                placeholder="Follow-up remarks"
                value={followUpForm.remarks}
                onChange={e =>
                  setFollowUpForm({
                    ...followUpForm,
                    remarks: e.target.value
                  })
                }
              />

              <button disabled={busy || !followUpForm.remarks.trim()}>
                Save Follow-Up
              </button>

              <button
                type="button"
                onClick={() => setFollowUpRow(null)}
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {notInterestedRow && (
          <div className="panel" style={{ marginTop: 24 }}>
            <h3>Mark Not Interested - {notInterestedRow.studentName}</h3>

            <form className="inline-form" onSubmit={markNotInterested}>
              <input
                required
                placeholder="Reason / remarks"
                value={notInterestedRemarks}
                onChange={e => setNotInterestedRemarks(e.target.value)}
              />

              <button
                className="danger"
                disabled={busy || !notInterestedRemarks.trim()}
              >
                Mark Not Interested
              </button>

              <button
                type="button"
                onClick={() => setNotInterestedRow(null)}
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {historyRow && (
          <div className="panel" style={{ marginTop: 24 }}>
            <h3>Follow-Up History - {historyRow.studentName}</h3>

            <table>
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Date</th>
                  <th>Remarks</th>
                  <th>FDO</th>
                </tr>
              </thead>

              <tbody>
                {(historyRow.followUps || []).map(item => (
                  <tr key={item._id || item.attemptNo}>
                    <td>#{item.attemptNo}</td>
                    <td>{formatDate(item.followUpDate)}</td>
                    <td>{item.remarks}</td>
                    <td>{item.createdBy?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setHistoryRow(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    </section>
  </div>;
}
