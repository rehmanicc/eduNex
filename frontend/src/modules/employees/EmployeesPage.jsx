import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import './employees.css';
import Pagination, { usePagination } from '../../components/Pagination';

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
  const [employees, setEmployees] = useState([]);
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

  return (
    <div className="employees-page">
      <div className="employees-title-row">
        <div>
          <h1>Employees</h1>
          <p>
            Every employee receives a system login automatically. Login roles and employment status are managed here.
          </p>
        </div>


      </div>

      {error ? <div className="employees-error">{error}</div> : null}

      <section className="employee-card">
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
                  <button type="button" className="btn-light" onClick={resetForm}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </section>

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
                    <th>Category</th>
                    <th>Subject</th>
                    <th>Designation</th>
                    <th>Posting</th>
                    <th>System Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {!employees.length ? (
                    <tr>
                      <td colSpan="10" className="empty-row">
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
                              <small>{emp.qualification || ''}</small>
                            </div>
                          </div>
                        </td>

                        <td>{emp.fatherName || '—'}</td>
                        <td>{emp.cnic || '—'}</td>
                        <td>{emp.mobileNo || emp.phone || '—'}</td>
                        <td>
                          {emp.category === 'academic_staff'
                            ? 'Academic'
                            : 'Non-Academic'}
                        </td>
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
                          <strong>{emp.branchId?.name || '—'}</strong>
                          <small>
                            {emp.wingType
                              ? wingLabelMap.get(emp.wingType) || emp.wingType
                              : 'Branch-wide'}
                          </small>
                        </td>
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
    </div>
  );
}
