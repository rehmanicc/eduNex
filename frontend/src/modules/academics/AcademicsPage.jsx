import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import './academics-v3.10.css';

const tabs = [
  'sessions',
  'programs',
  'courses'
];

function offeringLabel(academicType) {
  if (academicType === 'school') return 'Class';
  if (academicType === 'cambridge') return 'Cambridge Level';
  if (academicType === 'university') return 'Degree Program';
  if (academicType === 'college') return 'Program';
  return 'Class / Program';
}

function offeringPluralLabel(academicType) {
  if (academicType === 'school') return 'Classes';
  if (academicType === 'cambridge') return 'Cambridge Levels';
  if (academicType === 'university') return 'Degree Programs';
  if (academicType === 'college') return 'Programs';
  return 'Classes / Programs';
}

const SECTION_GENDERS = [
  ['boys', 'Boys'],
  ['girls', 'Girls']
];

const UNIVERSITY_SECTION_GENDERS = [
  ['boys', 'Boys'],
  ['girls', 'Girls'],
  ['both', 'Both']
];


function idOf(value) {
  return value?._id || value || '';
}

function displayDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
}



export default function Academics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab = tabs.includes(requestedTab) ? requestedTab : 'sessions';
  const [tab, setTab] = useState(initialTab);

  const [sessions, setSessions] = useState([]);
  const [sessionPeriods, setSessionPeriods] = useState([]);
  const [branches, setBranches] = useState([]);
  const [wings, setWings] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [subjectRows, setSubjectRows] = useState({});
  const [newSubject, setNewSubject] = useState({ name: '', code: '' });
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [subjectEditorOpen, setSubjectEditorOpen] = useState(false);
  const [modalSelectedIds, setModalSelectedIds] = useState([]);
  const [modalAvailablePick, setModalAvailablePick] = useState([]);
  const [modalChosenPick, setModalChosenPick] = useState([]);
  const [sections, setSections] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    try {
      const [
        ss,
        sp,
        st,
        pp,
        cc,
        sub,
        sec,
        ee
      ] = await Promise.all([
        api.get('/academics/sessions'),
        api.get('/academics/sessionPeriods'),
        api.get('/academics/structure'),
        api.get('/academics/programs'),
        api.get('/academics/courses'),
        api.get('/academics/subjects'),
        api.get('/academics/sections'),
        api.get('/employees')
      ]);

      setSessions(ss.data || []);
      setSessionPeriods(sp.data || []);
      setBranches(st.data?.branches || []);
      setWings(st.data?.wings || []);
      setPrograms(pp.data || []);
      setCourses(cc.data || []);
      setSubjects(sub.data || []);
      setSections(sec.data || []);
      setTeachers(
        (ee.data || []).filter(
          e =>
            e.category === 'academic_staff' ||
            String(e.type || '').toLowerCase() === 'teacher'
        )
      );

      setError('');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const requested = searchParams.get('tab');
    const nextTab = tabs.includes(requested) ? requested : 'sessions';
    if (nextTab !== tab) setTab(nextTab);
  }, [searchParams, tab]);

  function changeTab(nextTab) {
    setTab(nextTab);
    setSearchParams({ tab: nextTab });
  }

  useEffect(() => {
    setForm({});
    setEditingId(null);
    setSubjectEditorOpen(false);
    setError('');
  }, [tab]);

  const selectedProgram = useMemo(
    () => programs.find(p => idOf(p) === form.programId),
    [programs, form.programId]
  );

  const selectedCoursePeriod = Number(form.periodNumber || 0);
  const isUniversityProgram = selectedProgram?.academicType === 'university';

  useEffect(() => {
    if (tab !== 'courses' || !form.programId || !selectedCoursePeriod || !subjects.length) {
      if (tab === 'courses') setSubjectRows({});
      return;
    }
    const assigned = courses.filter(c =>
      String(idOf(c.programId)) === String(form.programId) &&
      Number(c.periodNumber || c.semester || 1) === selectedCoursePeriod
    );
    const next = {};
    for (const subject of subjects) {
      const existing = assigned.find(c =>
        String(idOf(c.subjectId)) === String(subject._id) ||
        String(c.code || '').toUpperCase() === String(subject.code || '').toUpperCase() ||
        String(c.name || '').toLowerCase() === String(subject.name || '').toLowerCase()
      );
      next[subject._id] = {
        selected: Boolean(existing),
        creditHours: existing?.creditHours ?? '',
        courseType: existing?.courseType || subject.defaultCourseType || 'theory'
      };
    }
    setSubjectRows(next);
  }, [tab, form.programId, selectedCoursePeriod, subjects, courses, isUniversityProgram]);

  function updateSubjectRow(subjectId, patch) {
    setSubjectRows(prev => ({ ...prev, [subjectId]: { ...(prev[subjectId] || {}), ...patch } }));
  }

  function openSubjectModal() {
    setModalSelectedIds(subjects.filter(subject => subjectRows[subject._id]?.selected).map(subject => subject._id));
    setModalAvailablePick([]);
    setModalChosenPick([]);
    setSubjectModalOpen(true);
  }

  function moveSubjectsRight() {
    setModalSelectedIds(prev => [...new Set([...prev, ...modalAvailablePick])]);
    setModalAvailablePick([]);
  }

  function moveSubjectsLeft() {
    const remove = new Set(modalChosenPick);
    setModalSelectedIds(prev => prev.filter(id => !remove.has(id)));
    setModalChosenPick([]);
  }

  function applySubjectSelection() {
    const selected = new Set(modalSelectedIds);
    setSubjectRows(prev => Object.fromEntries(subjects.map(subject => [subject._id, {
      ...(prev[subject._id] || { creditHours: '', courseType: subject.defaultCourseType || 'theory' }),
      selected: selected.has(subject._id)
    }])));
    setSubjectModalOpen(false);
    setSubjectEditorOpen(true);
  }

  async function addSubjectToMaster() {
    if (!newSubject.name.trim() || !newSubject.code.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post('/academics/subjects', newSubject);
      setNewSubject({ name: '', code: '' });
      setSubjects(prev => [...prev.filter(x => String(x._id) !== String(data._id)), data].sort((a, b) => a.name.localeCompare(b.name)));
      setSubjectRows(prev => ({
        ...prev,
        [data._id]: { selected: false, creditHours: '', courseType: data.defaultCourseType || 'theory' }
      }));
      setModalSelectedIds(prev => [...new Set([...prev, data._id])]);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setBusy(false); }
  }

  async function saveCourseAssignments(e) {
    e.preventDefault();
    if (!form.programId || !selectedCoursePeriod) return;
    const items = subjects
      .filter(subject => subjectRows[subject._id]?.selected)
      .map(subject => {
        const rawCredit = subjectRows[subject._id]?.creditHours;
        return {
          subjectId: subject._id,
          creditHours: rawCredit === '' || rawCredit === null || rawCredit === undefined ? null : Number(rawCredit),
          courseType: subjectRows[subject._id]?.courseType || subject.defaultCourseType || 'theory'
        };
      });
    setBusy(true);
    try {
      await api.post('/academics/course-assignments/bulk', {
        programId: form.programId,
        periodNumber: selectedCoursePeriod,
        items
      });
      await loadAll();
      setSubjectEditorOpen(false);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setBusy(false); }
  }


  const assignedWingIds = useMemo(
    () => [
      ...new Set(
        branches.flatMap(branch => branch.wingIds || [])
      )
    ],
    [branches]
  );

  const assignedWings = useMemo(
    () =>
      wings.filter(
        wing =>
          wing.isActive !== false &&
          assignedWingIds.includes(String(wing._id))
      ),
    [wings, assignedWingIds]
  );

  const selectedBranch = useMemo(
    () => branches.find(b => String(b._id) === String(form.branchId)),
    [branches, form.branchId]
  );

  const wingsForSelectedBranch = useMemo(
    () => {
      const ids = new Set((selectedBranch?.wingIds || []).map(String));
      return wings.filter(wing => wing.isActive !== false && ids.has(String(wing._id)));
    },
    [wings, selectedBranch]
  );

  const selectedWing = useMemo(
    () => wings.find(w => String(w._id) === String(form.wingId)),
    [wings, form.wingId]
  );

  const programsForSelectedSession = useMemo(() => {
    if (!form.academicSessionId) return [];
    const ids = new Set(sessionPeriods
      .filter(x => idOf(x.academicSessionId) === String(form.academicSessionId))
      .map(x => String(idOf(x.programId))));
    return programs.filter(p => ids.has(String(p._id)));
  }, [programs, sessionPeriods, form.academicSessionId]);

  const periodLabel =
    selectedProgram?.academicSystem === 'annual'
      ? 'Year'
      : 'Semester';

  const periodOptions = selectedProgram
    ? Array.from(
        {
          length: Number(
            selectedProgram.durationUnits ||
            selectedProgram.durationSemesters ||
            1
          )
        },
        (_, i) => i + 1
      )
    : [];

  const filteredCourses = courses.filter(c => {
    if (!form.programId) return true;
    if (idOf(c.programId) !== form.programId) return false;

    if (form.periodNumber) {
      return Number(c.periodNumber || c.semester) === Number(form.periodNumber);
    }

    return true;
  });

  const filteredSections = sections.filter(s => {
    if (form.programId && idOf(s.programId) !== form.programId) return false;

    if (
      form.academicSessionId &&
      idOf(s.academicSessionId) !== form.academicSessionId
    ) {
      return false;
    }

    if (form.periodNumber) {
      return Number(s.periodNumber || s.semester) === Number(form.periodNumber);
    }

    return true;
  });

  function set(name, value) {
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function resetDependentProgramFields(programId) {
    setForm(prev => ({
      ...prev,
      programId,
      periodNumber: '',
      courseId: '',
      sectionId: '',
      genderType: ''
    }));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({});
    setError('');
  }

  function editRow(resource, row) {
    setEditingId(row._id);
    setError('');

    if (resource === 'sessions') {
      setForm({
        name: row.name || ''
      });
    }



    if (resource === 'programs') {
      setForm({
        name: row.name || '',
        code: row.code || '',
        branchId: idOf(row.branchId),
        wingId: idOf(row.wingId),
        academicType: row.academicType || '',
        academicSystem: row.academicSystem || 'semester',
        durationUnits:
          row.durationUnits ||
          row.durationSemesters ||
          '',
        academicSessionId: idOf(row.sessionPeriod?.academicSessionId),
        startDate: row.sessionPeriod?.startDate
          ? new Date(row.sessionPeriod.startDate).toISOString().slice(0, 10)
          : '',
        endDate: row.sessionPeriod?.endDate
          ? new Date(row.sessionPeriod.endDate).toISOString().slice(0, 10)
          : ''
      });
    }

    if (resource === 'courses') {
      const programId = idOf(row.programId);
      const programPeriod = sessionPeriods.find(x => idOf(x.programId) === String(programId));
      setForm({
        academicSessionId: idOf(programPeriod?.academicSessionId),
        programId,
        periodNumber: row.periodNumber || row.semester || '',
        name: row.name || '',
        code: row.code || '',
        creditHours: row.creditHours ?? 3,
        courseType: row.courseType || 'theory'
      });
    }

    if (resource === 'sections') {
      setForm({
        programId: idOf(row.programId),
        academicSessionId: idOf(row.academicSessionId),
        periodNumber: row.periodNumber || row.semester || '',
        name: row.name || '',
        capacity: row.capacity ?? 50,
        genderType: row.genderType || '',
        classTeacherId: idOf(row.classTeacherId)
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteRow(resource, row) {
    const label =
      row.name ||
      row.code ||
      row.courseId?.code ||
      row.courseId?.name ||
      'this record';

    const ok = window.confirm(
      `Delete "${label}"?\n\nThis action cannot be undone.`
    );

    if (!ok) return;

    setBusy(true);

    try {
      await api.delete(`/academics/${resource}/${row._id}`);

      if (editingId === row._id) {
        cancelEdit();
      }

      await loadAll();
      setError('');
    } catch (e) {
      setError(
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message
      );
    } finally {
      setBusy(false);
    }
  }

  function actionCell(resource, row) {
    return (
      <td>
        <button
          type="button"
          onClick={() => editRow(resource, row)}
          disabled={busy}
        >
          Edit
        </button>

        {' | '}

        <button
          type="button"
          onClick={() => deleteRow(resource, row)}
          disabled={busy}
        >
          Delete
        </button>
      </td>
    );
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);

    try {
      let payload = { ...form };



      if (tab === 'programs') {
        const { academicSessionId, startDate, endDate, ...programPayload } = payload;
        let programId = editingId;

        if (editingId) {
          await api.put(`/academics/programs/${editingId}`, programPayload);
        } else {
          const created = await api.post('/academics/programs', programPayload);
          programId = created.data?._id;
        }

        if (!programId) throw new Error('Class / Program could not be saved.');

        const existingPeriod = sessionPeriods.find(p =>
          idOf(p.programId) === String(programId) &&
          idOf(p.academicSessionId) === String(academicSessionId)
        );
        const periodPayload = { academicSessionId, programId, startDate, endDate };
        if (existingPeriod) {
          await api.put(`/academics/sessionPeriods/${existingPeriod._id}`, periodPayload);
        } else {
          await api.post('/academics/sessionPeriods', periodPayload);
        }
      } else if (tab === 'courses') {
        const { academicSessionId, ...coursePayload } = payload;
        if (editingId) await api.put(`/academics/courses/${editingId}`, coursePayload);
        else await api.post('/academics/courses', coursePayload);
      } else if (editingId) {
        await api.put(`/academics/${tab}/${editingId}`, payload);
      } else {
        await api.post(`/academics/${tab}`, payload);
      }

      setForm({});
      setEditingId(null);

      await loadAll();
      setError('');
    } catch (e) {
      setError(
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message
      );
    } finally {
      setBusy(false);
    }
  }

  function renderForm() {
    if (tab === 'sessions') {
      return (
        <>
          <input
            required
            placeholder="Session name, e.g. 2026"
            value={form.name || ''}
            onChange={e => set('name', e.target.value)}
          />
          <div className="academic-rule-note">
            Session is the common academic-year identity. Start / End dates are defined per Class / Program below.
          </div>
        </>
      );
    }



    if (tab === 'programs') {
      const academicType = selectedWing?.academicType || '';

      return (
        <>
          <select
            required
            value={form.branchId || ''}
            onChange={e => {
              const branchId = e.target.value;
              setForm(prev => ({ ...prev, branchId, wingId: '', academicType: '', name: '', code: '', academicSystem: '', durationUnits: '' }));
            }}
          >
            <option value="">Select Branch</option>
            {branches.filter(b => b.isActive !== false).map(branch => (
              <option value={branch._id} key={branch._id}>{branch.name} ({branch.code})</option>
            ))}
          </select>

          <select
            required
            disabled={!form.branchId}
            value={form.wingId || ''}
            onChange={e => {
              const wingId = e.target.value;
              const wing = wings.find(w => String(w._id) === String(wingId));
              setForm(prev => ({
                ...prev, wingId, academicType: wing?.academicType || '', name: '', code: '',
                academicSystem: wing?.academicType === 'school' ? 'annual' : '',
                durationUnits: wing?.academicType === 'school' ? 1 : ''
              }));
            }}
          >
            <option value="">{form.branchId ? 'Select Wing' : 'Select Branch First'}</option>
            {wingsForSelectedBranch.map(wing => (
              <option value={wing._id} key={wing._id}>{wing.name} — {wing.academicType}</option>
            ))}
          </select>

          <input
            required
            disabled={!form.wingId}
            placeholder={`${offeringLabel(academicType)} Name`}
            value={form.name || ''}
            onChange={e => set('name', e.target.value)}
          />

          <input
            required
            disabled={!form.wingId}
            placeholder="Code"
            value={form.code || ''}
            onChange={e => set('code', e.target.value)}
          />

          {academicType !== 'school' && (
            <>
              <select
                required
                value={form.academicSystem || ''}
                onChange={e =>
                  setForm(prev => ({
                    ...prev,
                    academicSystem: e.target.value,
                    durationUnits: ''
                  }))
                }
              >
                <option value="">Academic System</option>
                <option value="annual">Annual</option>
                <option value="semester">Semester</option>
              </select>

              <input
                required
                type="number"
                min="1"
                placeholder={
                  form.academicSystem === 'annual'
                    ? 'Duration in Years / Parts'
                    : form.academicSystem === 'semester'
                      ? 'Duration in Semesters'
                      : 'Select Academic System'
                }
                disabled={!form.academicSystem}
                value={form.durationUnits || ''}
                onChange={e => set('durationUnits', e.target.value)}
              />
            </>
          )}

          {academicType === 'school' && (
            <div className="academic-rule-note">
              School classes use Annual / 1 academic year automatically.
            </div>
          )}

          <select
            required
            value={form.academicSessionId || ''}
            onChange={e => set('academicSessionId', e.target.value)}
          >
            <option value="">Select Academic Session</option>
            {sessions.map(session => (
              <option value={session._id} key={session._id}>{session.name}</option>
            ))}
          </select>

          <label>
            Start Date
            <input required type="date" value={form.startDate || ''}
              onChange={e => set('startDate', e.target.value)} />
          </label>

          <label>
            End Date
            <input required type="date" min={form.startDate || undefined}
              value={form.endDate || ''}
              onChange={e => set('endDate', e.target.value)} />
          </label>

        </>
      );
    }

    if (tab === 'courses') {
      const duration = Number(selectedProgram?.durationUnits || selectedProgram?.durationSemesters || 1);
      const ready = Boolean(form.academicSessionId && form.programId && (duration === 1 || form.periodNumber));
      const selectedSubjects = subjects.filter(subject => subjectRows[subject._id]?.selected);
      return (
        <div className="academic-course-bulk">
          <div className="academic-course-context">
            <select required value={form.academicSessionId || ''} onChange={e => { setSubjectEditorOpen(false); setForm(prev => ({ ...prev, academicSessionId: e.target.value, programId: '', periodNumber: '' })); }}>
              <option value="">Select Session</option>
              {sessions.map(session => <option value={session._id} key={session._id}>{session.name}</option>)}
            </select>
            <select required disabled={!form.academicSessionId} value={form.programId || ''} onChange={e => {
              const programId = e.target.value;
              const p = programs.find(x => String(x._id) === String(programId));
              const d = Number(p?.durationUnits || p?.durationSemesters || 1);
              setSubjectEditorOpen(false);
              setForm(prev => ({ ...prev, programId, periodNumber: d === 1 ? 1 : '' }));
            }}>
              <option value="">{form.academicSessionId ? 'Select Class / Program' : 'Select Session First'}</option>
              {programsForSelectedSession.map(p => <option value={p._id} key={p._id}>{p.name}</option>)}
            </select>
            {selectedProgram && duration > 1 && <select required value={form.periodNumber || ''} onChange={e => { setSubjectEditorOpen(false); set('periodNumber', e.target.value); }}>
              <option value="">Select {periodLabel}</option>
              {periodOptions.map(n => <option value={n} key={n}>{periodLabel} {n}</option>)}
            </select>}
          </div>

          {!ready ? <div className="academic-rule-note">Select Session and Class / Program to configure subjects.</div> : <>
            <div className="course-selection-bar">
              <div><strong>Subjects</strong><span>{selectedSubjects.length} selected</span></div>
              <button type="button" onClick={openSubjectModal}>Select Subjects</button>
            </div>

            {subjectEditorOpen && (
              <>
                {!selectedSubjects.length ? <div className="academic-rule-note">No subjects selected. Click Select Subjects to add subjects for this class / program.</div> : <div className="academic-table-wrap">
                  <table className="course-config-table">
                    <thead><tr><th>Subject / Course</th><th>Code</th><th>Credit Hours <small>(Optional)</small></th><th>Theory / Practical</th><th>Action</th></tr></thead>
                    <tbody>{selectedSubjects.map(subject => {
                      const row = subjectRows[subject._id] || {};
                      return <tr key={subject._id}>
                        <td>{subject.name}</td>
                        <td>{subject.code}</td>
                        <td><input type="number" min="0" step="0.5" placeholder="Optional" value={row.creditHours ?? ''} onChange={e => updateSubjectRow(subject._id, { creditHours: e.target.value })} /></td>
                        <td><select value={row.courseType || 'theory'} onChange={e => updateSubjectRow(subject._id, { courseType: e.target.value })}>
                          <option value="theory">Theory</option><option value="practical">Practical</option><option value="lab">Theory + Lab</option><option value="project">Project</option>
                        </select></td>
                        <td><button type="button" className="course-remove-subject" onClick={() => updateSubjectRow(subject._id, { selected: false })}>Remove</button></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>}
                <div className="academic-bulk-actions"><button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Courses / Subjects'}</button></div>
              </>
            )}
          </>}
        </div>
      );
    }


    if (tab === 'sections') {
      return (
        <>
          <select
            required
            value={form.programId || ''}
            onChange={e => resetDependentProgramFields(e.target.value)}
          >
            <option value="">Select Class / Program</option>

            {programs.map(p => (
              <option value={p._id} key={p._id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            required
            value={form.academicSessionId || ''}
            onChange={e => set('academicSessionId', e.target.value)}
          >
            <option value="">Select Academic Session</option>

            {sessions.map(s => (
              <option value={s._id} key={s._id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            required
            disabled={!selectedProgram}
            value={form.periodNumber || ''}
            onChange={e => set('periodNumber', e.target.value)}
          >
            <option value="">
              {selectedProgram
                ? `Select ${periodLabel}`
                : 'Select Class / Program First'}
            </option>

            {periodOptions.map(n => (
              <option value={n} key={n}>
                {periodLabel} {n}
              </option>
            ))}
          </select>

          <select
            required
            disabled={!selectedProgram}
            value={form.genderType || ''}
            onChange={e => set('genderType', e.target.value)}
          >
            <option value="">Select Section Gender</option>
            {(selectedProgram?.academicType === 'university'
              ? UNIVERSITY_SECTION_GENDERS
              : SECTION_GENDERS
            ).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>

          <input
            required
            placeholder={selectedProgram?.academicType === 'university' ? 'Section name (e.g. A / Morning)' : 'Section name (e.g. Boys A / Girls A)'} 
            value={form.name || ''}
            onChange={e => set('name', e.target.value)}
          />

          <input
            type="number"
            min="1"
            placeholder="Capacity"
            value={form.capacity ?? 50}
            onChange={e => set('capacity', e.target.value)}
          />


          <select
            value={form.classTeacherId || ''}
            onChange={e => set('classTeacherId', e.target.value)}
          >
            <option value="">Section Class Teacher (Optional)</option>
            {teachers.map(t => (
              <option value={t._id} key={t._id}>
                {t.employeeNo ? `${t.employeeNo} - ` : ''}{t.name}
              </option>
            ))}
          </select>
        </>
      );
    }

    return null;
  }

  function rowsForTab() {
    if (tab === 'sessions') return sessions;
    if (tab === 'programs') return programs.map(program => {
      const periods = sessionPeriods.filter(p => idOf(p.programId) === String(program._id));
      const sessionPeriod = periods.sort((a,b) => String(b.academicSessionId?.name || '').localeCompare(String(a.academicSessionId?.name || '')))[0];
      return { ...program, sessionPeriod };
    });
    if (tab === 'courses') return filteredCourses;
    if (tab === 'sections') return sections;

    return [];
  }

  function renderTable() {
    const rows = rowsForTab();

    if (tab === 'sessions') {
      return (
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(r => (
              <tr key={r._id}>
                <td>{r.name}</td>
                <td>{r.isCurrent ? 'Current' : 'Available'}</td>
                {actionCell('sessions', r)}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }



    if (tab === 'programs') {
      return (
        <table>
          <thead>
            <tr>
              <th>Class / Program</th>
              <th>Code</th>
              <th>Wing</th>
              <th>Branch</th>
              <th>Structure</th>
              <th>Session</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(r => (
              <tr key={r._id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="muted">
                    {offeringLabel(r.academicType)}
                  </div>
                </td>

                <td>{r.code}</td>

                <td>
                  {r.wingId?.name || 'Unassigned Wing'}
                </td>

                <td>{r.branchId?.name || 'Legacy / Unassigned'}</td>

                <td>
                  {r.academicType === 'school'
                    ? '1 Academic Year'
                    : `${r.durationUnits || r.durationSemesters} ${
                        r.academicSystem === 'annual'
                          ? 'Year(s)'
                          : 'Semester(s)'
                      }`}
                </td>
                <td>{r.sessionPeriod?.academicSessionId?.name || '—'}</td>
                <td>{displayDate(r.sessionPeriod?.startDate) || '—'}</td>
                <td>{displayDate(r.sessionPeriod?.endDate) || '—'}</td>

                <td>
                  <button
                    type="button"
                    onClick={() => editRow('programs', r)}
                    disabled={busy}
                  >
                    Edit
                  </button>

                  {' | '}

                  <button
                    type="button"
                    onClick={() => deleteRow('programs', r)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (tab === 'courses') {
      const showCreditHours = true;
      return (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Subject / Course</th>
              <th>Class / Program</th>
              <th>Period</th>
              {showCreditHours && <th>Credit Hours</th>}
              <th>Theory / Practical</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const p = r.programId;
              const label = p?.academicSystem === 'annual' ? 'Year' : 'Semester';
              return <tr key={r._id}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td>{p?.name || '—'}</td>
                <td>{label} {r.periodNumber || r.semester}</td>
                {showCreditHours && <td>{r.creditHours ?? '—'}</td>}
                <td>{r.courseType}</td>
                <td><button type="button" onClick={() => deleteRow('courses', r)} disabled={busy}>Remove</button></td>
              </tr>;
            })}
          </tbody>
        </table>
      );
    }

    if (tab === 'sections') {
      return (
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th>Class / Program</th>
              <th>Session</th>
              <th>Period</th>
              <th>Gender</th>
              <th>Capacity</th>
              <th>Section Class Teacher</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(r => {
              const p = r.programId;
              const label =
                p?.academicSystem === 'annual'
                  ? 'Year'
                  : 'Semester';

              return (
                <tr key={r._id}>
                  <td>{r.name}</td>
                  <td>{p?.name || '—'}</td>
                  <td>{r.academicSessionId?.name || '—'}</td>
                  <td>{label} {r.periodNumber || r.semester}</td>
                  <td>
                    {r.genderType === 'boys'
                      ? 'Boys'
                      : r.genderType === 'girls'
                        ? 'Girls'
                        : r.genderType === 'both'
                          ? 'Both'
                          : 'Needs Gender'}
                  </td>
                  <td>{r.capacity}</td>
                  <td>{r.classTeacherId?.name || 'Not Assigned'}</td>
                  {actionCell('sections', r)}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }



    return null;
  }

  return (
    <div>
      <h1>Academics</h1>

      <div className="tabs">
        {tabs.map(x => (
          <button
            className={tab === x ? 'active' : ''}
            onClick={() => changeTab(x)}
            key={x}
          >
            {x === 'programs' ? 'Classes / Programs' : x === 'courses' ? 'Courses / Subjects' : x.charAt(0).toUpperCase() + x.slice(1)}
          </button>
        ))}
      </div>

      <h2>
        {tab === 'programs' ? offeringPluralLabel(selectedWing?.academicType) : tab === 'courses' ? 'Courses / Subjects' : tab.charAt(0).toUpperCase() + tab.slice(1)}
      </h2>

      {error && <p className="error">{error}</p>}

      <form onSubmit={tab === 'courses' ? saveCourseAssignments : save} className="inline-form">
        {renderForm()}

        {tab !== 'courses' && <button disabled={busy}>
          {busy ? 'Saving...' : editingId ? 'Update' : 'Add'}
        </button>}

        {editingId && (
          <button
            type="button"
            onClick={cancelEdit}
            disabled={busy}
          >
            Cancel
          </button>
        )}
      </form>

      {renderTable()}

      {subjectModalOpen && <div className="subject-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSubjectModalOpen(false); }}>
        <div className="subject-modal" role="dialog" aria-modal="true" aria-label="Select Subjects">
          <div className="subject-modal-head">
            <div><h3>Select Subjects</h3><p>Choose multiple subjects for the selected class / program.</p></div>
            <button type="button" className="subject-modal-close" onClick={() => setSubjectModalOpen(false)}>×</button>
          </div>

          <div className="subject-picker">
            <div className="subject-picker-column">
              <strong>Available Subjects</strong>
              <select multiple size="11" value={modalAvailablePick} onChange={e => setModalAvailablePick([...e.target.selectedOptions].map(o => o.value))}>
                {subjects.filter(subject => !modalSelectedIds.includes(subject._id)).map(subject => <option key={subject._id} value={subject._id}>{subject.name} ({subject.code})</option>)}
              </select>
            </div>
            <div className="subject-picker-actions">
              <button type="button" onClick={moveSubjectsRight} disabled={!modalAvailablePick.length}>→</button>
              <button type="button" onClick={moveSubjectsLeft} disabled={!modalChosenPick.length}>←</button>
            </div>
            <div className="subject-picker-column">
              <strong>Selected Subjects</strong>
              <select multiple size="11" value={modalChosenPick} onChange={e => setModalChosenPick([...e.target.selectedOptions].map(o => o.value))}>
                {subjects.filter(subject => modalSelectedIds.includes(subject._id)).map(subject => <option key={subject._id} value={subject._id}>{subject.name} ({subject.code})</option>)}
              </select>
            </div>
          </div>

          <div className="subject-modal-add">
            <strong>+ Add New Subject</strong>
            <input placeholder="Subject name" value={newSubject.name} onChange={e => setNewSubject(prev => ({ ...prev, name: e.target.value }))} />
            <input placeholder="Code" value={newSubject.code} onChange={e => setNewSubject(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} />
            <button type="button" onClick={addSubjectToMaster} disabled={busy || !newSubject.name.trim() || !newSubject.code.trim()}>Add</button>
          </div>

          <div className="subject-modal-footer">
            <span>{modalSelectedIds.length} subject(s) selected</span>
            <div><button type="button" className="secondary" onClick={() => setSubjectModalOpen(false)}>Cancel</button><button type="button" onClick={applySubjectSelection}>Use Selected Subjects</button></div>
          </div>
        </div>
      </div>}
    </div>
  );
}
