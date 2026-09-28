import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import './employees.css';
import Pagination, { usePagination } from '../../components/Pagination';
import { useAuth } from '../../contexts/AuthContext';

const emptyForm = {
  employeeCode: '',
  name: '',
  fatherName: '',
  cnic: '',
  qualification: '',
  mobileNo: '',
  email: '',
  address: '',
  dateOfBirth: '',
  dateOfJoining: '',
  category: 'academic_staff',
  subjectId: '',
  designationId: '',
  branchId: '',
  wingType: '',
  roleIds: [],
  isActive: true
};

const idOf = value => value?._id || value || '';
const dateInput = value => value ? String(value).slice(0, 10) : '';
const errorText = e =>
  e?.response?.data?.error ||
  e?.response?.data?.message ||
  e?.message ||
  'Request failed';

export default function EmployeesPage() {
  const { college } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportFields, setReportFields] = useState(['employeeCode', 'name', 'cnic', 'designation', 'qualification', 'mobileNo']);
  const employeePager = usePagination(employees);
  const [options, setOptions] = useState({
    categories: [],
    qualifications: [],
    designations: [],
    subjects: [],
    branches: [],
    availableWings: [],
    roles: [],
    canManageLoginAccess: false
  });

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadEmployees() {
    const res = await api.get('/employees');
    setEmployees(Array.isArray(res.data) ? res.data : []);
  }

  async function loadOptions() {
    const res = await api.get('/employees/options');

    setOptions({
      categories: res.data?.categories || [],
      qualifications: res.data?.qualifications || [],
      designations: res.data?.designations || [],
      subjects: res.data?.subjects || [],
      branches: res.data?.branches || [],
      availableWings: res.data?.availableWings || [],
      roles: res.data?.roles || [],
      canManageLoginAccess: Boolean(res.data?.canManageLoginAccess)
    });
  }

  async function loadAll() {
    try {
      setError('');
      await Promise.all([loadEmployees(), loadOptions()]);
    } catch (e) {
      setError(errorText(e));
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const academic = form.category === 'academic_staff';

  const filteredDesignations = useMemo(
    () =>
      options.designations.filter(
        d => d.isActive !== false && (!d.category || d.category === form.category)
      ),
    [options.designations, form.category]
  );

  const selectedBranch = useMemo(
    () =>
      options.branches.find(
        b => String(b._id) === String(form.branchId)
      ),
    [options.branches, form.branchId]
  );

  const wingLabelMap = useMemo(() => {
    const map = new Map();

    for (const item of options.availableWings || []) {
      if (typeof item === 'string') {
        map.set(item, item);
      } else if (item?.value) {
        map.set(item.value, item.label || item.name || item.value);
      } else if (item?.code) {
        map.set(item.code, item.label || item.name || item.code);
      }
    }

    return map;
  }, [options.availableWings]);

  const branchWingTypes = selectedBranch?.wingTypes || [];

  function update(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function changeCategory(value) {
    const employeeRole = options.roles.find(r => r.code === 'employee');
    const teacherRole = options.roles.find(r => r.code === 'teacher');
    setForm(prev => {
      const nextRoles = new Set(prev.roleIds || []);
      if (employeeRole) nextRoles.add(idOf(employeeRole));
      if (teacherRole) {
        if (value === 'academic_staff') nextRoles.add(idOf(teacherRole));
        else nextRoles.delete(idOf(teacherRole));
      }
      return {...prev,category:value,subjectId:value==='academic_staff'?prev.subjectId:'',designationId:'',roleIds:[...nextRoles]};
    });
  }

  function changeBranch(value) {
    setForm(prev => ({
      ...prev,
      branchId: value,
      wingType: ''
    }));
  }

  function choosePhoto(file) {
    if (photoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoFile(file || null);
    setPhotoPreview(file ? URL.createObjectURL(file) : '');
  }

  function resetForm() {
    if (photoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }

    setForm(emptyForm);
    setEditingId('');
    setPhotoFile(null);
    setPhotoPreview('');
    setError('');
  }

  function startEdit(emp) {
    setEditingId(emp._id);

    setForm({
      employeeCode: emp.employeeCode || emp.employeeNo || '',
      name: emp.name || '',
      fatherName: emp.fatherName || '',
      cnic: emp.cnic || '',
      qualification: emp.qualification || '',
      mobileNo: emp.mobileNo || emp.phone || '',
      email: emp.email || '',
      address: emp.address || '',
      dateOfBirth: dateInput(emp.dateOfBirth || emp.dob),
      dateOfJoining: dateInput(emp.dateOfJoining || emp.joiningDate),
      category: emp.category || 'academic_staff',
      subjectId: idOf(emp.subjectId),
      designationId: idOf(emp.designationId),
      branchId: idOf(emp.branchId),
      wingType: emp.wingType || '',
      roleIds: (emp.linkedUser?.roleIds || []).map(idOf),
      isActive: emp.isActive !== false
    });

    setPhotoFile(null);
    setPhotoPreview(emp.photoUrl || '');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validate() {
    const required = [
      ['name', 'Name'],
      ['fatherName', 'Father Name'],
      ['cnic', 'CNIC'],
      ['qualification', 'Qualification'],
      ['mobileNo', 'Mobile No'],
      ['address', 'Address'],
      ['dateOfBirth', 'Date of Birth'],
      ['dateOfJoining', 'Date of Joining'],
      ['category', 'Category'],
      ['designationId', 'Designation'],
      ['branchId', 'Primary Branch']
    ];

    for (const [field, label] of required) {
      if (!String(form[field] || '').trim()) {
        return `${label} is required.`;
      }
    }

    if (academic && !form.subjectId) {
      return 'Primary Subject is required for Academic employees.';
    }

    return '';
  }

  async function saveEmployee(e) {
    e.preventDefault();

    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const payload = {
        name: form.name.trim(),
        fatherName: form.fatherName.trim(),
        cnic: form.cnic.trim(),
        qualification: form.qualification,
        mobileNo: form.mobileNo.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        dateOfBirth: form.dateOfBirth,
        dateOfJoining: form.dateOfJoining,
        category: form.category,
        subjectId: academic ? form.subjectId : null,
        designationId: form.designationId,
        branchId: form.branchId,
        wingType: form.wingType || undefined,
        roleIds: form.roleIds,
        isActive: form.isActive
      };

      let saved;

      if (editingId) {
        const res = await api.put(`/employees/${editingId}`, payload);
        saved = res.data;
      } else {
        const res = await api.post('/employees', payload);
        saved = res.data;
      }

      const employeeId = saved?._id || editingId;

      if (photoFile && employeeId) {
        const body = new FormData();
        body.append('photo', photoFile);

        await api.post(`/employees/${employeeId}/photo`, body, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      resetForm();
      setShowForm(false);
      await loadEmployees();
    } catch (e2) {
      setError(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function deleteEmployee(id) {
    if (!window.confirm('Delete this employee?')) return;

    try {
      await api.delete(`/employees/${id}`);
      await loadEmployees();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function createEmployeeLogin(emp) {
    if (!window.confirm(`Create login for ${emp.name}? Default password will be user@123.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/employees/${emp._id}/login`, {});
      await loadEmployees();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }


  const reportFieldOptions = [
    ['employeeCode', 'Employee ID'], ['name', 'Name'], ['fatherName', 'Father Name'],
    ['cnic', 'CNIC'], ['designation', 'Designation'], ['department', 'Department / Subject'],
    ['qualification', 'Qualification'], ['mobileNo', 'Phone'], ['email', 'Email'],
    ['dateOfJoining', 'Joining Date']
  ];

  function employeeReportValue(emp, key) {
    if (key === 'employeeCode') return emp.employeeCode || emp.employeeNo || '';
    if (key === 'designation') return emp.designationId?.name || emp.designation || '';
    if (key === 'department') return emp.subjectId?.name || emp.subjectId?.title || emp.subjectId?.code || '';
    if (key === 'mobileNo') return emp.mobileNo || emp.phone || '';
    if (key === 'dateOfJoining') return dateInput(emp.dateOfJoining || emp.joiningDate);
    return emp[key] || '';
  }

  function printEmployeeReport() {
    if (!reportFields.length) { setError('Select at least one field for the report.'); return; }
    const selected = reportFieldOptions.filter(([key]) => reportFields.includes(key));
    const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[ch]));
    const logo = college?.logoUrl || '';
    const rows = employees.map((emp, index) => `<tr><td>${index + 1}</td>${selected.map(([key]) => `<td>${esc(employeeReportValue(emp, key))}</td>`).join('')}</tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) { setError('Pop-up blocked. Please allow pop-ups to print the report.'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Employee / Teacher List</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}header{text-align:center;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:14px}header img{width:58px;height:58px;object-fit:contain;float:left}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:0}p{font-size:10px;margin:4px 0;color:#555}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #777;padding:6px;text-align:left}th{background:#f1f5f9}.meta{display:flex;justify-content:space-between;font-size:9px;margin:8px 0}footer{margin-top:12px;text-align:right;font-size:9px;color:#555}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header>${logo ? `<img src="${esc(logo)}" alt="Logo">` : ''}<h1>${esc(college?.displayName || college?.name || 'Institution')}</h1><h2>Employee / Teacher List</h2><p>${esc(college?.address || '')}</p></header><div class="meta"><span>Total Employees: ${employees.length}</span><span>Printed: ${new Date().toLocaleDateString()}</span></div><table><thead><tr><th>#</th>${selected.map(([,label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${selected.length + 1}">No employees found.</td></tr>`}</tbody></table><footer>Powered by TrackiaTech</footer></body></html>`);
    win.document.close(); win.focus(); setTimeout(() => win.print(), 250);
  }

  return (
    <div className="employees-page">
      <div className="employees-title-row">
        <div>
          <h1>Employees</h1>
          <p>
            Every employee receives a system login automatically. Login roles and employment status are managed here.
          </p>
        </div>
        <div className="employees-page-actions">
          <button type="button" className="btn-light" onClick={() => setShowReport(true)}>Print Teacher List</button>
          <button type="button" onClick={() => { resetForm(); setShowForm(true); }}>Add Employee</button>
        </div>
      </div>

      {error ? <div className="employees-error">{error}</div> : null}

      {showForm ? <section className="employee-card">
            <div className="employee-card-title">
              <div>
                <h2>{editingId ? 'Edit Employee' : 'Add Employee'}</h2>
                <small>
                  Employee Code is generated automatically. New login default password is user@123 and must be changed on first login.
                </small>
              </div>

              {editingId ? (
                <button type="button" className="btn-light" onClick={resetForm}>
                  Cancel Edit
                </button>
              ) : null}
            </div>

            <form onSubmit={saveEmployee}>
              <div className="employee-form-grid">
                <label>
                  <span>Employee Code</span>
                  <input
                    value={form.employeeCode || 'Auto on Save'}
                    readOnly
                    className="read-only"
                  />
                </label>

                <label>
                  <span>Name *</span>
                  <input
                    value={form.name}
                    onChange={e => update('name', e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>Father Name *</span>
                  <input
                    value={form.fatherName}
                    onChange={e => update('fatherName', e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>CNIC *</span>
                  <input
                    value={form.cnic}
                    onChange={e => update('cnic', e.target.value)}
                    placeholder="35202-1234567-1"
                    required
                  />
                </label>

                <label>
                  <span>Qualification *</span>
                  <select
                    value={form.qualification}
                    onChange={e => update('qualification', e.target.value)}
                    required
                  >
                    <option value="">Select Qualification</option>
                    {options.qualifications.map(q => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Mobile No *</span>
                  <input
                    value={form.mobileNo}
                    onChange={e => update('mobileNo', e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>Email (Optional)</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => update('email', e.target.value)}
                    placeholder="Used for login if available"
                  />
                  <small>Login also works with CNIC.</small>
                </label>

                <label>
                  <span>Date of Birth *</span>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={e => update('dateOfBirth', e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>Date of Joining *</span>
                  <input
                    type="date"
                    value={form.dateOfJoining}
                    onChange={e => update('dateOfJoining', e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>Category *</span>
                  <select
                    value={form.category}
                    onChange={e => changeCategory(e.target.value)}
                    required
                  >
                    {options.categories.map(c => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                {academic ? (
                  <label>
                    <span>Primary Subject *</span>
                    <select
                      value={form.subjectId}
                      onChange={e => update('subjectId', e.target.value)}
                      required
                    >
                      <option value="">Select Subject</option>
                      {options.subjects.map(subject => (
                        <option key={subject._id} value={subject._id}>
                          {subject.name || subject.title || subject.code}
                        </option>
                      ))}
                    </select>
                    <small>
                      Profile/default subject only. Teacher Assignment can use another subject.
                    </small>
                  </label>
                ) : null}

                <label>
                  <span>Designation *</span>
                  <select
                    value={form.designationId}
                    onChange={e => update('designationId', e.target.value)}
                    required
                  >
                    <option value="">Select Designation</option>
                    {filteredDesignations.map(d => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Primary Branch *</span>
                  <select
                    value={form.branchId}
                    onChange={e => changeBranch(e.target.value)}
                    required
                  >
                    <option value="">Select Branch</option>
                    {options.branches.map(branch => (
                      <option key={branch._id} value={branch._id}>
                        {branch.name}
                        {branch.code ? ` (${branch.code})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Wing (Optional)</span>
                  <select
                    value={form.wingType}
                    onChange={e => update('wingType', e.target.value)}
                    disabled={!form.branchId}
                  >
                    <option value="">Branch-wide / No Wing</option>
                    {branchWingTypes.map(wingType => (
                      <option key={wingType} value={wingType}>
                        {wingLabelMap.get(wingType) || wingType}
                      </option>
                    ))}
                  </select>
                  <small>
                    Home/default Wing only. It does not restrict where a teacher can teach.
                  </small>
                </label>

                <label>
                  <span>Employment Status *</span>
                  <select value={form.isActive ? 'active' : 'inactive'} onChange={e => update('isActive', e.target.value === 'active')}>
                    <option value="active">Active</option>
                    <option value="inactive">Left / Inactive</option>
                  </select>
                  <small>Left / Inactive automatically deactivates this employee login.</small>
                </label>

                {options.canManageLoginAccess ? (
                  <div className="employee-wide employee-role-picker">
                    <span>System Roles</span>
                    <div>
                      {(options.roles || []).map(role => {
                        const locked = role.code === 'employee' || (academic && role.code === 'teacher');
                        const checked = locked || form.roleIds.includes(idOf(role));
                        return <label key={role._id} className={locked ? 'locked' : ''}>
                          <input type="checkbox" checked={checked} disabled={locked} onChange={e => update('roleIds', e.target.checked ? [...new Set([...form.roleIds, idOf(role)])] : form.roleIds.filter(id => String(id) !== String(idOf(role))))}/>
                          {role.name}
                        </label>;
                      })}
                    </div>
                    <small>Employee is mandatory. Academic staff also keep Teacher. Additional operational roles are managed here, not on User Accounts.</small>
                  </div>
                ) : null}

                <label className="employee-wide">
                  <span>Address *</span>
                  <textarea
                    rows="2"
                    value={form.address}
                    onChange={e => update('address', e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>Employee / Teacher Photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={e => choosePhoto(e.target.files?.[0] || null)}
                  />
                  <small>JPG, PNG or WEBP. Maximum 2 MB.</small>
                </label>

                <div className="photo-preview-box">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Employee preview" />
                  ) : (
                    <span>No photo selected</span>
                  )}
                </div>
              </div>

              <div className="employee-form-actions">
                <button type="submit" disabled={busy}>
                  {busy
                    ? 'Saving...'
                    : editingId
                      ? 'Save Changes'
                      : 'Add Employee'}
                </button>

                {editingId ? (
                  <button type="button" className="btn-light" onClick={() => { resetForm(); setShowForm(false); }}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </section> : null}

          <section className="employee-card">
            <div className="employee-card-title">
              <div>
                <h2>Employee Directory</h2>
                <small>{employees.length} employee(s)</small>
              </div>
            </div>

            <div className="employee-table-wrap">
              <table className="employee-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Father Name</th>
                    <th>CNIC</th>
                    <th>Mobile</th>
                    <th>Subject</th>
                    <th>Designation</th>
                    <th>System Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {!employees.length ? (
                    <tr>
                      <td colSpan="8" className="empty-row">
                        No employees added yet.
                      </td>
                    </tr>
                  ) : (
                    employeePager.rows.map(emp => (
                      <tr key={emp._id}>
                        <td>
                          <div className="employee-cell">
                            {emp.photoUrl ? (
                              <img src={emp.photoUrl} alt="" />
                            ) : (
                              <div className="employee-avatar">
                                {(emp.name || '?').slice(0, 1).toUpperCase()}
                              </div>
                            )}

                            <div>
                              <strong>
                                {emp.employeeCode || emp.employeeNo} — {emp.name}
                              </strong>
                            </div>
                          </div>
                        </td>

                        <td>{emp.fatherName || '—'}</td>
                        <td>{emp.cnic || '—'}</td>
                        <td>{emp.mobileNo || emp.phone || '—'}</td>
                        <td>
                          {emp.category === 'academic_staff'
                            ? (
                                emp.subjectId?.name ||
                                emp.subjectId?.title ||
                                emp.subjectId?.code ||
                                '—'
                              )
                            : '—'}
                        </td>
                        <td>{emp.designationId?.name || emp.designation || '—'}</td>
                        <td>
                          {emp.linkedUser ? (
                            <>
                              <strong>{emp.linkedUser.emailIsSynthetic ? (emp.cnic || 'CNIC login') : (emp.linkedUser.email || emp.cnic)}</strong>
                              <small>{(emp.linkedUser.roleIds || []).map(r => r.name).join(' + ') || 'Employee'}</small>
                              {emp.linkedUser.mustChangePassword ? <small>First login password change required</small> : null}
                            </>
                          ) : options.canManageLoginAccess ? (
                            <button type="button" disabled={busy} onClick={() => createEmployeeLogin(emp)}>Create Login</button>
                          ) : <span>—</span>}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" onClick={() => startEdit(emp)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteEmployee(emp._id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <Pagination {...employeePager} />
            </div>
          </section>

      {showReport ? <div className="employee-report-backdrop" onMouseDown={() => setShowReport(false)}>
        <div className="employee-report-modal" onMouseDown={e => e.stopPropagation()}>
          <div className="employee-card-title"><div><h2>Teacher List Report</h2><small>Select the fields to include in the printed list.</small></div><button type="button" className="btn-light" onClick={() => setShowReport(false)}>Close</button></div>
          <div className="employee-report-fields">{reportFieldOptions.map(([key,label]) => <label key={key}><input type="checkbox" checked={reportFields.includes(key)} onChange={e => setReportFields(prev => e.target.checked ? [...new Set([...prev,key])] : prev.filter(x => x !== key))}/><span>{label}</span></label>)}</div>
          <div className="employee-report-actions"><button type="button" className="btn-light" onClick={() => setReportFields(reportFieldOptions.map(([key]) => key))}>Select All</button><button type="button" onClick={printEmployeeReport}>Print Report</button></div>
        </div>
      </div> : null}
    </div>
  );
}
