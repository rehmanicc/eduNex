import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import './admissions-modal.css';
import AdmissionsModuleNav from './AdmissionsModuleNav';
import Pagination, { usePagination } from '../../components/Pagination';
import AdmissionFilter from './AdmissionFilter';
import ResultFields from './ResultFields';
import { blankProfile, admissionStatuses, getError, idOf, resultRules, alignResults, referenceLabel, nearestMatches, percentageOf } from './admissionsUtils';

export default function AdmissionsPage(){
  const [admissionStatus,setAdmissionStatus]=useState('form_submitted');
  const [admissions,setAdmissions]=useState([]);
  const [programs,setPrograms]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [editingProfile,setEditingProfile]=useState(null);
  const [profileForm,setProfileForm]=useState(blankProfile);
  const [photoFile,setPhotoFile]=useState(null);
  const [confirming,setConfirming]=useState(null);
  const [confirmForm,setConfirmForm]=useState({previousResults:[],migrationCertificateNo:'',eligible:false});
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [filterField,setFilterField]=useState('studentName');
  const [filterValue,setFilterValue]=useState('');

  const selectedProfileProgram=useMemo(()=>programs.find(p=>idOf(p)===profileForm.programId),[programs,profileForm.programId]);
  const filteredAdmissions=useMemo(()=>nearestMatches(admissions,filterField,filterValue),[admissions,filterField,filterValue]);
  const admissionPager=usePagination(filteredAdmissions, `${filterField}|${filterValue}`);

  async function loadLookups(){ const [programRes,sessionRes]=await Promise.all([api.get('/academics/programs'),api.get('/academics/sessions')]); setPrograms(programRes.data||[]); setSessions(sessionRes.data||[]); }
  async function loadAdmissions(status=admissionStatus){ const res=await api.get(`/admissions?status=${encodeURIComponent(status)}`); setAdmissions(res.data||[]); }
  useEffect(()=>{loadLookups().catch(e=>setError(getError(e)));},[]);
  useEffect(()=>{loadAdmissions().catch(e=>setError(getError(e)));},[admissionStatus]);

  function updateProfileResult(index,field,value){setProfileForm(prev=>({...prev,previousResults:prev.previousResults.map((row,i)=>i===index?{...row,[field]:value}:row)}));}
  function updateConfirmResult(index,field,value){setConfirmForm(prev=>({...prev,previousResults:prev.previousResults.map((row,i)=>i===index?{...row,[field]:value}:row)}));}

  function openProfile(row) {
    setEditingProfile(row);
    setPhotoFile(null);

    const program = programs.find(p => idOf(p) === idOf(row.programId));
    const rules = resultRules(program || row.programId);

    setProfileForm({
      studentName: row.studentName || '',
      fatherName: row.fatherName || '',
      address: row.address || '',
      contactNo: row.contactNo || '',
      fatherContact: row.fatherContact || '',
      whatsappNo: row.whatsappNo || '',
      email: row.email || '',
      guardianName: row.guardianName || '',
      guardianContact: row.guardianContact || '',
      guardianRelation: row.guardianRelation || '',
      bFormCnic: row.bFormCnic || '',
      fatherCnic: row.fatherCnic || '',
      bloodGroup: row.bloodGroup || '',
      secondAddress: row.secondAddress || '',
      dateOfBirth: row.dateOfBirth
        ? String(row.dateOfBirth).slice(0, 10)
        : '',
      gender: row.gender || '',
      programId: idOf(row.programId),
      academicSessionId: idOf(row.academicSessionId),
      periodNumber: row.periodNumber || 1,
      migrationRequired: row.migrationRequired === true,
      migrationCertificateNo: row.migrationCertificateNo || '',
      eligible: Boolean(row.eligible),
      previousResults: alignResults(row.previousResults || [], rules)
    });
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (!editingProfile) return;

    setBusy(true);
    setError('');

    try {
      await api.put(`/admissions/${editingProfile._id}/profile`, {
        ...profileForm,
        periodNumber: Number(profileForm.periodNumber),
        previousResults: profileForm.previousResults.map(row => ({
          ...row,
          obtainedMarks:
            row.obtainedMarks === '' ? undefined : Number(row.obtainedMarks),
          totalMarks:
            row.totalMarks === '' ? undefined : Number(row.totalMarks)
        }))
      });

      if (photoFile) {
        const data = new FormData();
        data.append('photo', photoFile);

        await api.post(
          `/admissions/${editingProfile._id}/photo`,
          data,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
      }

      setEditingProfile(null);
      setPhotoFile(null);
      setAdmissionStatus('fee_pending');
      await loadAdmissions('fee_pending');
    } catch (e2) {
      setError(getError(e2));
    } finally {
      setBusy(false);
    }
  }

  function openConfirm(row) {
    setConfirming(row);

    const program = programs.find(p => idOf(p) === idOf(row.programId));
    const rules = resultRules(program || row.programId);

    setConfirmForm({
      previousResults: alignResults(row.previousResults || [], rules),
      migrationCertificateNo: row.migrationCertificateNo || '',
      eligible: Boolean(row.eligible)
    });
  }

  async function confirmAdmission(e) {
    e.preventDefault();
    if (!confirming) return;

    setBusy(true);
    setError('');

    try {
      await api.post(`/admissions/${confirming._id}/confirm`, {
        previousResults: confirmForm.previousResults.map(row => ({
          ...row,
          obtainedMarks:
            row.obtainedMarks === '' ? undefined : Number(row.obtainedMarks),
          totalMarks:
            row.totalMarks === '' ? undefined : Number(row.totalMarks)
        })),
        migrationCertificateNo: confirmForm.migrationCertificateNo,
        eligible: confirmForm.eligible
      });

      setConfirming(null);
      setAdmissionStatus('confirmed');
      await loadAdmissions('confirmed');
    } catch (e2) {
      setError(getError(e2));
    } finally {
      setBusy(false);
    }
  }


  function confirmationNeeds(row, form=confirmForm) {
    const program = programs.find(p => idOf(p) === idOf(row?.programId)) || row?.programId;
    const rules = resultRules(program);
    const requiredRule = rules.find(r => r.confirmRequired === true);
    const result = requiredRule
      ? (form.previousResults || []).find(r => String(r.level || '').toLowerCase() === String(requiredRule.level || '').toLowerCase())
      : null;
    const obtained = Number(result?.obtainedMarks);
    const total = Number(result?.totalMarks);
    const obtainedMissing = Boolean(requiredRule) && !(result?.obtainedMarks !== '' && result?.obtainedMarks !== undefined && result?.obtainedMarks !== null && Number.isFinite(obtained) && obtained >= 0);
    const totalMissing = Boolean(requiredRule) && !(result?.totalMarks !== '' && result?.totalMarks !== undefined && result?.totalMarks !== null && Number.isFinite(total) && total > 0);
    const marksInvalid = Boolean(requiredRule) && !obtainedMissing && !totalMissing && obtained > total;
    const boardRollMissing = Boolean(requiredRule?.boardRollRequired) && !String(result?.boardRollNo || '').trim();
    return {
      eligibility: form.eligible !== true,
      result: Boolean(requiredRule) && (obtainedMissing || totalMissing || marksInvalid || boardRollMissing),
      resultLevel: requiredRule?.level || '',
      obtainedMissing,
      totalMissing,
      marksInvalid,
      boardRollMissing,
      migration: Boolean(row?.migrationRequired) && !String(form.migrationCertificateNo || '').trim(),
      rollNo: !String(row?.rollNo || '').trim()
    };
  }

  function updateConfirmResultByLevel(level, field, value) {
    setConfirmForm(prev => ({
      ...prev,
      previousResults: (prev.previousResults || []).map(row =>
        String(row.level || '').toLowerCase() === String(level || '').toLowerCase()
          ? { ...row, [field]: value }
          : row
      )
    }));
  }

  function resultSummary(row) {
    const program = programs.find(p => idOf(p) === idOf(row?.programId)) || row?.programId;
    const rules = resultRules(program);
    const results = Array.isArray(row?.previousResults) ? row.previousResults : [];

    const findResult = level => results.find(
      item => String(item.level || '').toLowerCase() === String(level || '').toLowerCase()
    );

    const entered = result => {
      if (!result) return false;
      const obtained = Number(result.obtainedMarks);
      const total = Number(result.totalMarks);
      return result.obtainedMarks !== '' &&
        result.obtainedMarks !== undefined &&
        result.obtainedMarks !== null &&
        result.totalMarks !== '' &&
        result.totalMarks !== undefined &&
        result.totalMarks !== null &&
        Number.isFinite(obtained) &&
        Number.isFinite(total) &&
        total > 0;
    };

    const display = result => {
      const pct = percentageOf(result);
      return `${result.level}: ${pct ? `${pct}%` : 'Result Entered'}`;
    };

    // College/board pathway: 9th -> 10th
    // University pathway: 11th -> 12th
    // If the final result exists, it replaces the earlier-stage result in the table.
    const finalRule = rules.find(rule => rule.confirmRequired === true);
    if (finalRule) {
      const finalResult = findResult(finalRule.level);
      if (entered(finalResult)) return display(finalResult);

      const earlierRule = rules.find(rule => rule.level !== finalRule.level);
      const earlierResult = earlierRule ? findResult(earlierRule.level) : null;

      if (entered(earlierResult)) {
        return `${display(earlierResult)} • ${finalRule.level}: Waiting`;
      }

      return 'Result Waiting';
    }

    // Single-result school classes keep their own previous-class result when entered.
    const available = rules
      .map(rule => findResult(rule.level))
      .filter(entered);

    if (available.length) return available.map(display).join(' • ');
    return 'Result Waiting';
  }


  return <div className="admissions-workspace">
    <AdmissionsModuleNav/>
    <section className="admissions-page-content">
      {error&&<p className="error">{error}</p>}
      <>
        <h2>Admissions</h2>

        <p className="muted">
          Inquiry information is prefetched into the Admission Form. Reference remains read-only.
        </p>

        <div className="admission-tabs-filter-row">
          <div className="tabs">
            {admissionStatuses.map(([value, label]) => (
              <button
                key={value}
                className={admissionStatus === value ? 'active' : ''}
                onClick={() => setAdmissionStatus(value)}
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
              <th>Form No</th>
              <th>Student</th>
              <th>Father Name</th>
              <th>Class / Program</th>
              <th>Session</th>
              <th>Results</th>
              <th>Roll No</th>
              {admissionStatus !== 'fee_pending' && <th>Migration</th>}
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {admissionPager.rows.map(row => (
              <tr key={row._id}>
                <td>{row.formNo || 'Not Assigned'}</td>

                <td>{row.studentName}</td>
                <td>{row.fatherName || '—'}</td>
                <td>{row.programId?.name || ''}</td>
                <td>{row.academicSessionId?.name || '—'}</td>
                <td>{resultSummary(row)}</td>
                <td>{row.rollNo || '—'}</td>

                {admissionStatus !== 'fee_pending' && (
                  <td>
                    {row.migrationRequired
                      ? row.migrationCertificateNo
                        ? `Complete: ${row.migrationCertificateNo}`
                        : 'Pending'
                      : 'Not Required'}
                  </td>
                )}

                <td>{row.status}</td>

                <td className="row-actions">
                  {row.status === 'form_submitted' && (
                    <button onClick={() => openProfile(row)}>Complete Form</button>
                  )}

                  {row.status === 'provisional' && (
                    <button onClick={() => openConfirm(row)}>Confirm Admission</button>
                  )}
                </td>
              </tr>
            ))}

            {!filteredAdmissions.length && (
              <tr>
                <td colSpan={admissionStatus === 'fee_pending' ? 9 : 10}>No records found.</td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination {...admissionPager} />

        {editingProfile && (
          <div className="admission-modal-backdrop">
            <div className="admission-modal admission-modal-large">
              <div className="admission-modal-header">
                <div>
                  <h3>Admission Form - {editingProfile.studentName}</h3>
                  <p>
                    Inquiry fields are prefetched and may be corrected. Reference cannot be edited.
                  </p>
                </div>

                <button
                  type="button"
                  className="admission-modal-close"
                  onClick={() => setEditingProfile(null)}
                  disabled={busy}
                >
                  ×
                </button>
              </div>

              <form className="admission-modal-form" onSubmit={saveProfile}>
                <div className="admission-section-title admission-modal-wide">Academic Details</div>

                <label>
                  <span>Academic Session *</span>
                  <select required value={profileForm.academicSessionId} onChange={e=>setProfileForm({...profileForm,academicSessionId:e.target.value})}>
                    <option value="">Select Session</option>
                    {sessions.map(session=><option key={session._id} value={session._id}>{session.name}</option>)}
                  </select>
                </label>

                <label>
                  <span>Program of Study *</span>
                  <select required value={profileForm.programId} onChange={e=>{
                    const programId=e.target.value; const program=programs.find(p=>idOf(p)===programId); const rules=resultRules(program);
                    setProfileForm(prev=>({...prev,programId,previousResults:alignResults(prev.previousResults,rules)}));
                  }}>
                    <option value="">Select Program</option>
                    {programs.map(program=><option key={program._id} value={program._id}>{program.name}</option>)}
                  </select>
                </label>

                <label>
                  <span>{selectedProfileProgram?.academicSystem==='semester'?'Semester *':'Part / Year *'}</span>
                  <input required type="number" min="1" max={selectedProfileProgram?.durationUnits||undefined} value={profileForm.periodNumber} onChange={e=>setProfileForm({...profileForm,periodNumber:e.target.value})}/>
                </label>

                <div className="admission-section-title admission-modal-wide">Student Personal Details</div>

                <label><span>Student Name *</span><input required value={profileForm.studentName} onChange={e=>setProfileForm({...profileForm,studentName:e.target.value})}/></label>
                <label><span>Father Name *</span><input required value={profileForm.fatherName} onChange={e=>setProfileForm({...profileForm,fatherName:e.target.value})}/></label>
                <label><span>B-Form / CNIC</span><input value={profileForm.bFormCnic} onChange={e=>setProfileForm({...profileForm,bFormCnic:e.target.value})}/></label>

                <label><span>Father CNIC</span><input value={profileForm.fatherCnic} onChange={e=>setProfileForm({...profileForm,fatherCnic:e.target.value})}/></label>
                <label><span>Date of Birth</span><input type="date" value={profileForm.dateOfBirth} onChange={e=>setProfileForm({...profileForm,dateOfBirth:e.target.value})}/></label>
                <label><span>Gender *</span><select required value={profileForm.gender} onChange={e=>setProfileForm({...profileForm,gender:e.target.value})}><option value="">Select Gender</option><option value="male">Male</option><option value="female">Female</option></select></label>

                <label><span>Contact No.</span><input value={profileForm.contactNo} onChange={e=>setProfileForm({...profileForm,contactNo:e.target.value})}/></label>
                <label><span>Father Contact *</span><input required value={profileForm.fatherContact} onChange={e=>setProfileForm({...profileForm,fatherContact:e.target.value})}/></label>
                <label><span>WhatsApp No.</span><input value={profileForm.whatsappNo} onChange={e=>setProfileForm({...profileForm,whatsappNo:e.target.value})}/></label>

                <label><span>Blood Group</span><input value={profileForm.bloodGroup} onChange={e=>setProfileForm({...profileForm,bloodGroup:e.target.value})}/></label>
                <label><span>Email</span><input type="email" value={profileForm.email} onChange={e=>setProfileForm({...profileForm,email:e.target.value})}/></label>
                <label><span>Reference</span><input readOnly className="admission-readonly-input" value={referenceLabel(editingProfile.referenceType,editingProfile.referenceDetail)}/></label>

                <label className="admission-modal-wide"><span>Current Address</span><input value={profileForm.address} onChange={e=>setProfileForm({...profileForm,address:e.target.value})}/></label>
                <label className="admission-modal-wide"><span>Permanent Address</span><input value={profileForm.secondAddress} onChange={e=>setProfileForm({...profileForm,secondAddress:e.target.value})}/></label>

                <div className="admission-section-title admission-modal-wide">Guardian Details</div>
                <label><span>Guardian</span><input value={profileForm.guardianName} onChange={e=>setProfileForm({...profileForm,guardianName:e.target.value})}/></label>
                <label><span>Guardian Contact</span><input value={profileForm.guardianContact} onChange={e=>setProfileForm({...profileForm,guardianContact:e.target.value})}/></label>
                <label><span>Relation With Guardian</span><input value={profileForm.guardianRelation} onChange={e=>setProfileForm({...profileForm,guardianRelation:e.target.value})}/></label>

                <div className="admission-section-title admission-modal-wide">Previous Results</div>
                <ResultFields rows={profileForm.previousResults} rules={resultRules(selectedProfileProgram)} onChange={updateProfileResult} showBoardRoll/>

                <label className="admission-check-row admission-modal-wide">
                  <input
                    type="checkbox"
                    checked={profileForm.eligible}
                    onChange={e => setProfileForm({ ...profileForm, eligible: e.target.checked })}
                  />
                  <span>Eligible for Admission</span>
                </label>

                <label className="admission-check-row admission-modal-wide">
                  <input
                    type="checkbox"
                    checked={profileForm.migrationRequired}
                    onChange={e =>
                      setProfileForm({
                        ...profileForm,
                        migrationRequired: e.target.checked,
                        migrationCertificateNo: e.target.checked
                          ? profileForm.migrationCertificateNo
                          : ''
                      })
                    }
                  />
                  <span>Migration/NOC Required</span>
                </label>

                {profileForm.migrationRequired && (
                  <label className="admission-modal-wide">
                    <span>Migration/NOC No.</span>
                    <input
                      placeholder="Can be added later while Provisional"
                      value={profileForm.migrationCertificateNo}
                      onChange={e =>
                        setProfileForm({
                          ...profileForm,
                          migrationCertificateNo: e.target.value
                        })
                      }
                    />
                  </label>
                )}

                <div className="admission-modal-actions">
                  <button
                    type="button"
                    className="admission-secondary-action"
                    onClick={() => setEditingProfile(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="admission-primary-action"
                    disabled={busy}
                  >
                    {busy ? 'Saving...' : 'Save Admission Form'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {confirming && (
          <div className="admission-modal-backdrop">
            <div className="admission-modal">
              <div className="admission-modal-header">
                <div>
                  <h3>Confirm Admission - {confirming.studentName}</h3>
                  <p>
                    College requires final 10th result + Board Roll No. University requires final 12th result + Board Roll No.
                  </p>
                </div>

                <button
                  type="button"
                  className="admission-modal-close"
                  onClick={() => setConfirming(null)}
                  disabled={busy}
                >
                  ×
                </button>
              </div>

              <form className="admission-modal-form" onSubmit={confirmAdmission}>
                {(() => {
                  const needs = confirmationNeeds(confirming);
                  const requiredResult = (confirmForm.previousResults || []).find(row =>
                    String(row.level || '').toLowerCase() === String(needs.resultLevel || '').toLowerCase()
                  ) || {};
                  const pending = [];
                  if (needs.eligibility) pending.push('Eligibility Check');
                  if (needs.obtainedMissing) pending.push(`${needs.resultLevel} Obtained Marks`);
                  if (needs.totalMissing) pending.push(`${needs.resultLevel} Total Marks`);
                  if (needs.marksInvalid) pending.push(`${needs.resultLevel} Marks must not exceed Total Marks`);
                  if (needs.boardRollMissing) pending.push(`${needs.resultLevel} Board Roll No.`);
                  if (needs.migration) pending.push('Migration/NOC No.');
                  if (needs.rollNo) pending.push('Roll No.');

                  return <>
                    {pending.length > 0 && (
                      <div className="admission-readonly-card admission-modal-wide">
                        <strong>Pending compulsory requirements</strong>
                        <span>{pending.join(' • ')}</span>
                      </div>
                    )}

                    {(needs.obtainedMissing || needs.totalMissing || needs.marksInvalid || needs.boardRollMissing) && (
                      <div className="admission-results-table admission-modal-wide">
                        <div className="admission-results-head">
                          <div className="admission-result-level-head">Required Result</div>
                          {needs.boardRollMissing && <div>Board Roll No.</div>}
                          {(needs.obtainedMissing || needs.marksInvalid) && <div>Obtained Marks</div>}
                          {(needs.totalMissing || needs.marksInvalid) && <div>Total Marks</div>}
                        </div>
                        <div className="admission-results-row">
                          <div className="admission-result-level"><strong>{needs.resultLevel} Result</strong></div>
                          {needs.boardRollMissing && (
                            <div className="admission-result-cell">
                              <input
                                value={requiredResult.boardRollNo || ''}
                                onChange={e => updateConfirmResultByLevel(needs.resultLevel, 'boardRollNo', e.target.value)}
                              />
                            </div>
                          )}
                          {(needs.obtainedMissing || needs.marksInvalid) && (
                            <div className="admission-result-cell">
                              <input
                                type="number"
                                min="0"
                                value={requiredResult.obtainedMarks ?? ''}
                                onChange={e => updateConfirmResultByLevel(needs.resultLevel, 'obtainedMarks', e.target.value)}
                              />
                            </div>
                          )}
                          {(needs.totalMissing || needs.marksInvalid) && (
                            <div className="admission-result-cell">
                              <input
                                type="number"
                                min="1"
                                value={requiredResult.totalMarks ?? ''}
                                onChange={e => updateConfirmResultByLevel(needs.resultLevel, 'totalMarks', e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {needs.migration && (
                      <label className="admission-modal-wide">
                        <span>Migration/NOC No.</span>
                        <input
                          placeholder="Enter when received"
                          value={confirmForm.migrationCertificateNo}
                          onChange={e => setConfirmForm({ ...confirmForm, migrationCertificateNo: e.target.value })}
                        />
                      </label>
                    )}

                    {needs.eligibility && <label className="admission-check-row admission-modal-wide">
                      <input
                        type="checkbox"
                        checked={confirmForm.eligible}
                        onChange={e => setConfirmForm({ ...confirmForm, eligible: e.target.checked })}
                      />
                      <span>Eligibility Check - Eligible for Admission</span>
                    </label>}

                    {needs.rollNo && (
                      <div className="admission-readonly-card admission-modal-wide">
                        <strong>Roll No. is pending</strong>
                        <span>Allocate the student's Roll No. before confirming admission.</span>
                      </div>
                    )}

                    {pending.length === 0 && (
                      <div className="admission-readonly-card admission-modal-wide">
                        <strong>All compulsory requirements are complete.</strong>
                        <span>Confirm Admission will complete the admission now.</span>
                      </div>
                    )}
                  </>;
                })()}

                <div className="admission-modal-actions">
                  <button
                    type="button"
                    className="admission-secondary-action"
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </button>

                  <button
                    className="admission-primary-action"
                    disabled={busy}
                  >
                    Confirm Admission
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    </section>
  </div>;
}
