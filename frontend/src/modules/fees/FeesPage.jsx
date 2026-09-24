import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './fees.css';
import Pagination, { usePagination } from '../../components/Pagination';

const getError = e => e?.response?.data?.error || e?.response?.data?.message || 'Something went wrong.';
const money = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const isoDate = value => value ? String(value).slice(0, 10) : '';
const amountInWords = value => {
  const n = Math.round(Number(value || 0));
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const under1000 = num => {
    let out = '';
    if (num >= 100) { out += `${ones[Math.floor(num / 100)]} Hundred `; num %= 100; }
    if (num >= 20) { out += `${tens[Math.floor(num / 10)]} `; num %= 10; }
    if (num > 0) out += `${ones[num]} `;
    return out.trim();
  };
  let x = n; const parts = [];
  const groups = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']];
  for (const [size, label] of groups) {
    if (x >= size) { const q = Math.floor(x / size); parts.push(`${under1000(q)} ${label}`); x %= size; }
  }
  if (x > 0) parts.push(under1000(x));
  return `${parts.join(' ')} Rupees Only`;
};
const feeTypeOf = line => { const raw = String(line?.feeType || line?.feeCycle || 'monthly').toLowerCase(); return raw === 'annual' ? 'annual' : (raw === 'once' || raw === 'periodic' ? 'once' : 'monthly'); };

function rolesOf(user) {
  return new Set([
    ...(user?.roleCodes || []),
    ...(user?.roles || []).map(role => role?.code),
    user?.roleCode
  ].filter(Boolean).map(code => String(code).toLowerCase()));
}

function hasPermission(user, permission) {
  const permissions = new Set(user?.permissions || user?.effectivePermissions || []);
  return permissions.has('*') || permissions.has(permission);
}

export default function FeesPage() {
  const { user, college } = useAuth();
  const roles = rolesOf(user);
  const approver = roles.has('principal') || roles.has('director');
  const structureCreator = ['accountant', 'admin', 'principal', 'director'].some(code => roles.has(code));
  const canEditFeeStructure = roles.has('director') || hasPermission(user, 'MANAGE_FEE_STRUCTURE');
  const feeVoucherMode = college?.feeVoucherMode || 'bank_and_cash';
  const fixedVoucherType = feeVoucherMode === 'cash_only' ? 'cash' : feeVoucherMode === 'bank_only' ? 'bank' : '';
  const defaultVoucherType = fixedVoucherType || 'bank';

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'student-details';
  const [tab, setTabState] = useState(initialTab);
  const setTab = next => { setTabState(next); setSearchParams(prev => { const copy = new URLSearchParams(prev); copy.set('tab', next); if (next !== 'structures') copy.delete('sub'); return copy; }); };
  useEffect(() => { const next = searchParams.get('tab') || 'student-details'; if (next !== tab) setTabState(next); }, [searchParams]);
  const [structureSubTab, setStructureSubTab] = useState(searchParams.get('sub') === 'default-installments' ? 'default-installments' : 'structures');
  useEffect(() => {
    if (tab !== 'structures') return;
    setStructureSubTab(searchParams.get('sub') === 'default-installments' ? 'default-installments' : 'structures');
  }, [searchParams, tab]);
  const setStructureSection = next => {
    setStructureSubTab(next);
    setSearchParams(prev => {
      const copy = new URLSearchParams(prev);
      copy.set('tab', 'structures');
      if (next === 'default-installments') copy.set('sub', 'default-installments');
      else copy.delete('sub');
      return copy;
    });
  };
  const [heads, setHeads] = useState([]);
  const structureHeads = useMemo(() => heads.filter(h => !['hostel', 'transport'].includes(String(h.definitionSource || 'fees').toLowerCase())), [heads]);
  const manualAdditionalHeads = structureHeads;
  const [structures, setStructures] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [defaultInstallmentPlans, setDefaultInstallmentPlans] = useState([]);
  const [defaultInstallmentForm, setDefaultInstallmentForm] = useState({ academicSessionId: '', programId: '', installments: [{ title: 'Installment 1', sequence: 1, dueDate: '' }] });
  const [showDefaultInstallmentEditor, setShowDefaultInstallmentEditor] = useState(false);
  const [students, setStudents] = useState([]);
  const [postingStudents, setPostingStudents] = useState([]);
  const [generatedVouchers, setGeneratedVouchers] = useState([]);
  const [voucherSearch, setVoucherSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const emptyStructure = {
    name: '', academicSessionId: '', programIds: [], feeLines: []
  };
  const [showStructureModal, setShowStructureModal] = useState(false);
  const [structureForm, setStructureForm] = useState(emptyStructure);
  const [editingStructure, setEditingStructure] = useState(null);

  const [packageEditor, setPackageEditor] = useState(null);
  const [applicableStructures, setApplicableStructures] = useState([]);
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [packageLines, setPackageLines] = useState([]);
  const [changeReason, setChangeReason] = useState('');
  const [packageInstallments, setPackageInstallments] = useState([]);

  const [postingEditor, setPostingEditor] = useState(null);
  const [postingSummary, setPostingSummary] = useState(null);
  const [eligibleVoucherHeads, setEligibleVoucherHeads] = useState([]);
  const [eligibleHeadsBusy, setEligibleHeadsBusy] = useState(false);
  const [postingForm, setPostingForm] = useState({
    periodKey: '', installmentSequence: '', scheduledAmount: '', dueDate: '', remarks: '',
    additionalLines: [], voucherType: defaultVoucherType, selectedFeeHeadCodes: []
  });

  const [paymentEditor, setPaymentEditor] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [payValues, setPayValues] = useState({});
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState(feeVoucherMode === 'bank_only' ? 'bank' : 'cash');
  const [challanNo, setChallanNo] = useState('');

  const [showBulkVoucher, setShowBulkVoucher] = useState(false);
  const [bulkVoucher, setBulkVoucher] = useState({
    academicSessionId: '', programIds: [], dueDate: '', additionalLines: [], voucherType: defaultVoucherType, selectedFeeHeadCodes: []
  });

  useEffect(() => {
    if (!fixedVoucherType) return;
    setPostingForm(prev => ({ ...prev, voucherType: fixedVoucherType }));
    setBulkVoucher(prev => ({ ...prev, voucherType: fixedVoucherType }));
    setPaymentMethod(fixedVoucherType);
  }, [fixedVoucherType]);

  const emptyListFilters = { academicSessionId: '', programId: '', rollNo: '', formNo: '', name: '', fatherName: '' };
  const [studentFilters, setStudentFilters] = useState(emptyListFilters);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStudentSummary, setSelectedStudentSummary] = useState(null);
  const [studentDetailTab, setStudentDetailTab] = useState('package');
  const [reportType, setReportType] = useState('defaulters');
  const [reportFilters, setReportFilters] = useState({ academicSessionId:'', programId:'', from:'', to:'', cutoff:new Date().toISOString().slice(0,10), status:'', feeHeadCode:'' });
  const [reportResult, setReportResult] = useState(null);

  async function loadCore() {
    try {
      setError('');
      const [headRes, structureRes, programRes, sessionRes, defaultRes] = await Promise.all([
        api.get('/fees/system-heads'), api.get('/fees/structures'),
        api.get('/academics/programs'), api.get('/academics/sessions'), api.get('/fees/default-installments')
      ]);
      setHeads(headRes.data || []);
      setStructures(structureRes.data || []);
      setPrograms(programRes.data || []);
      setSessions(sessionRes.data || []);
      setDefaultInstallmentPlans(defaultRes.data || []);
    } catch (e) { setError(getError(e)); }
  }

  async function loadStudents() {
    try {
      const res = await api.get('/fees/student-packages');
      const rows = res.data || [];
      setStudents(rows);
      return rows;
    } catch (e) {
      setError(getError(e));
      return [];
    }
  }

  async function loadPostingStudents() {
    try { const res = await api.get('/fees/posting/students'); setPostingStudents(res.data || []); }
    catch (e) { setError(getError(e)); }
  }

  async function loadFeeVouchers() {
    try { const res = await api.get('/fees/posting/vouchers'); setGeneratedVouchers(res.data || []); }
    catch (e) { setError(getError(e)); }
  }

  useEffect(() => { loadCore(); loadStudents(); }, []);
  useEffect(() => {
    if (tab === 'student-details' || tab === 'generate-vouchers') {
      loadPostingStudents();
      loadFeeVouchers();
    }
  }, [tab]);

  const headName = code => heads.find(head => head.code === code)?.name || code;
  const structureTotal = useMemo(() => structureForm.feeLines.reduce((sum, line) => sum + Number(line.amount || 0), 0), [structureForm.feeLines]);
  const selectedStructurePrograms = useMemo(() => programs.filter(p => structureForm.programIds.includes(p._id)), [programs, structureForm.programIds]);
  const semesterCycleInvalid = useMemo(() => structureForm.feeLines.some(line => (line.feeType || line.feeCycle) === 'semester') && selectedStructurePrograms.some(p => String(p.academicType || '').toLowerCase() !== 'university'), [structureForm.feeLines, selectedStructurePrograms]);

  function toggleProgram(id) {
    setStructureForm(prev => ({ ...prev, programIds: prev.programIds.includes(id) ? prev.programIds.filter(x => x !== id) : [...prev.programIds, id] }));
  }
  function setHeadAmount(code, value) {
    setStructureForm(prev => {
      const existing = prev.feeLines.find(line => line.feeHeadCode === code);
      const other = prev.feeLines.filter(line => line.feeHeadCode !== code);
      if (value === '') return { ...prev, feeLines: other };
      return {
        ...prev,
        feeLines: [...other, {
          feeHeadCode: code,
          amount: value,
          feeType: existing?.feeType || existing?.feeCycle || 'monthly',
          feeCycle: existing?.feeType || existing?.feeCycle || 'monthly',
          defaultInstallments: []
        }]
      };
    });
  }
  function setHeadCycle(code, feeType) {
    setStructureForm(prev => {
      const line = prev.feeLines.find(x => x.feeHeadCode === code) || { feeHeadCode: code, amount: '' };
      const other = prev.feeLines.filter(x => x.feeHeadCode !== code);
      return { ...prev, feeLines: [...other, { ...line, feeType, feeCycle: feeType, defaultInstallments: [] }] };
    });
  }
  function setHeadInstallmentCount(code, value) {
    const count = Math.max(1, Math.min(7, Number(value || 1)));
    setStructureForm(prev => ({
      ...prev,
      feeLines: prev.feeLines.map(line => {
        if (line.feeHeadCode !== code) return line;
        const current = line.defaultInstallments || [];
        return {
          ...line,
          defaultInstallments: Array.from({ length: count }, (_, index) => current[index] || {
            title: `Installment ${index + 1}`, sequence: index + 1, amount: '', dueDate: ''
          }).map((x, index) => ({ ...x, title: x.title || `Installment ${index + 1}`, sequence: index + 1 }))
        };
      })
    }));
  }
  function updateHeadInstallment(code, index, patch) {
    setStructureForm(prev => ({
      ...prev,
      feeLines: prev.feeLines.map(line => line.feeHeadCode === code
        ? { ...line, defaultInstallments: (line.defaultInstallments || []).map((x, i) => i === index ? { ...x, ...patch } : x) }
        : line)
    }));
  }
  function splitHeadInstallmentsEqually(code) {
    setStructureForm(prev => ({
      ...prev,
      feeLines: prev.feeLines.map(line => {
        if (line.feeHeadCode !== code) return line;
        const count = line.defaultInstallments?.length || 1;
        const total = Number(line.amount || 0);
        const base = Math.floor((total / count) * 100) / 100;
        let used = 0;
        return {
          ...line,
          defaultInstallments: (line.defaultInstallments || []).map((x, index) => {
            const amount = index === count - 1 ? Number((total - used).toFixed(2)) : base;
            used += amount;
            return { ...x, amount };
          })
        };
      })
    }));
  }
  const annualSchedulesValid = true;



  function openNewStructure() {
    setEditingStructure(null);
    setStructureForm(emptyStructure);
    setError('');
    setShowStructureModal(true);
  }

  function openEditStructure(row) {
    setEditingStructure(row);
    setError('');
    setStructureForm({
      name: row.name || '',
      academicSessionId: row.academicSessionId?._id || row.academicSessionId || '',
      programIds: (row.programIds || []).map(p => p?._id || p),
      feeLines: (row.feeLines || []).map(line => ({
        feeHeadCode: line.feeHeadCode,
        amount: line.amount ?? '',
        feeType: line.feeType || (line.feeCycle === 'periodic' ? 'once' : line.feeCycle) || 'monthly',
        feeCycle: line.feeType || (line.feeCycle === 'periodic' ? 'once' : line.feeCycle) || 'monthly',
        defaultInstallments: []
      }))
    });
    setShowStructureModal(true);
  }

  async function createStructure(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const payload = {
        ...structureForm,
        feeLines: structureForm.feeLines.map(x => ({
          feeHeadCode: x.feeHeadCode,
          amount: Number(x.amount),
          feeType: x.feeType || x.feeCycle || 'monthly',
          feeCycle: x.feeType || x.feeCycle || 'monthly',
          defaultInstallments: []
        }))
      };
      if (editingStructure) await api.put(`/fees/structures/${editingStructure._id}/revise`, payload);
      else await api.post('/fees/structures', payload);
      setStructureForm(emptyStructure); setEditingStructure(null); setShowStructureModal(false); await loadCore();
    } catch (e2) { setError(getError(e2)); }
    finally { setBusy(false); }
  }

  async function decideStructure(kind, row) {
    const remarks = window.prompt(`${kind === 'approve' ? 'Approval' : 'Rejection'} remarks:`, '') ?? '';
    try { await api.post(`/fees/structures/${row._id}/${kind}`, { remarks }); await loadCore(); }
    catch (e) { setError(getError(e)); }
  }

  function setDefaultInstallmentCount(value) {
    const count = Math.max(1, Math.min(7, Number(value || 1)));
    setDefaultInstallmentForm(prev => ({
      ...prev,
      installments: Array.from({ length: count }, (_, index) => prev.installments[index] || { title: `Installment ${index + 1}`, sequence: index + 1, dueDate: '' })
        .map((item, index) => ({ ...item, title: item.title || `Installment ${index + 1}`, sequence: index + 1 }))
    }));
  }
  function loadDefaultInstallmentForm(academicSessionId, programId) {
    const found = defaultInstallmentPlans.find(x => String(x.academicSessionId?._id || x.academicSessionId) === String(academicSessionId) && String(x.programId?._id || x.programId) === String(programId));
    setDefaultInstallmentForm({
      academicSessionId,
      programId,
      installments: found?.installments?.length ? found.installments.map((x, index) => ({ title: x.title || `Installment ${index + 1}`, sequence: index + 1, dueDate: isoDate(x.dueDate) })) : [{ title: 'Installment 1', sequence: 1, dueDate: '' }]
    });
    setShowDefaultInstallmentEditor(true);
  }
  async function saveDefaultInstallments(e) {
    e.preventDefault();
    const f = defaultInstallmentForm;
    if (!f.academicSessionId || !f.programId || !f.installments.length || f.installments.some(x => !x.dueDate)) {
      setError('Select Session and Program / Class and enter all default due dates.'); return;
    }
    setBusy(true); setError('');
    try {
      await api.put('/fees/default-installments', { academicSessionId: f.academicSessionId, programId: f.programId, installments: f.installments });
      await loadCore();
      setShowDefaultInstallmentEditor(false);
      setDefaultInstallmentForm({ academicSessionId: '', programId: '', installments: [{ title: 'Installment 1', sequence: 1, dueDate: '' }] });
    } catch (e2) { setError(getError(e2)); }
    finally { setBusy(false); }
  }

  async function openPackageEditor(row) {
    setError(''); setPackageEditor(row); setChangeReason(''); setPackageInstallments(row.plan?.installments || []);
    try {
      // Always fetch the latest default installment schedule when opening a student package.
      // Do not rely only on the page-level cached state because the defaults may have been
      // created/edited immediately before opening this modal.
      const [structureRes, defaultRes] = await Promise.all([
        api.get(`/fees/admissions/${row.admission._id}/applicable-structures`),
        api.get('/fees/default-installments')
      ]);
      const options = structureRes.data || [];
      const freshDefaults = defaultRes.data || [];
      setApplicableStructures(options);
      setDefaultInstallmentPlans(freshDefaults);
      const preferred = options[0]?._id || row.plan?.feeStructureId?._id || '';
      setSelectedStructureId(preferred);
      loadStructureIntoPackage(preferred, options, row.plan, freshDefaults, row.admission);
    } catch (e) { setError(getError(e)); }
  }

  function loadStructureIntoPackage(
    id,
    options = applicableStructures,
    existingPlan = packageEditor?.plan,
    defaults = defaultInstallmentPlans,
    admissionOverride = packageEditor?.admission
  ) {
    const structure = options.find(item => item._id === id);
    if (!structure) return setPackageLines([]);
    const existingByCode = new Map((existingPlan?.packageLines || []).map(line => [line.feeHeadCode, line]));
    setPackageLines((structure.feeLines || []).map(line => ({
      feeHeadCode: line.feeHeadCode,
      standardAmount: Number(line.amount || 0),
      discountAmount: Number(existingByCode.get(line.feeHeadCode)?.discountAmount || 0),
      feeType: line.feeType || (line.feeCycle === 'periodic' ? 'once' : line.feeCycle) || 'monthly',
      feeCycle: line.feeType || (line.feeCycle === 'periodic' ? 'once' : line.feeCycle) || 'monthly'
    })));
    const tuition = (structure.feeLines || []).find(line => String(line.feeHeadCode).toUpperCase() === 'TUITION');
    if (['annual','semester'].includes(tuition?.feeType || tuition?.feeCycle)) {
      const current = existingPlan?.installments || [];
      if (current.length) {
        setPackageInstallments(current.map((x, i) => ({ title: x.title || `Installment ${i+1}`, sequence: i+1, amount: x.amount ?? '', dueDate: isoDate(x.dueDate) })));
      } else {
        const admission = admissionOverride || packageEditor?.admission;
        const def = (defaults || []).find(x =>
          String(x.academicSessionId?._id || x.academicSessionId) === String(admission?.academicSessionId?._id || admission?.academicSessionId) &&
          String(x.programId?._id || x.programId) === String(admission?.programId?._id || admission?.programId)
        );
        const count = Math.max(1, def?.installments?.length || 1);
        const existingTuition = existingByCode.get(tuition.feeHeadCode);
        const finalTuition = Math.max(0, Number(tuition.amount || 0) - Number(existingTuition?.discountAmount || 0));
        const totalUnits = Math.floor(finalTuition / 10);
        const baseUnits = Math.floor(totalUnits / count);
        const remainderUnits = totalUnits - (baseUnits * count);
        setPackageInstallments(Array.from({ length: count }, (_, i) => ({
          title: def?.installments?.[i]?.title || `Installment ${i + 1}`,
          sequence: i + 1,
          dueDate: isoDate(def?.installments?.[i]?.dueDate),
          amount: (baseUnits + (i === count - 1 ? remainderUnits : 0)) * 10
        })));
      }
    } else setPackageInstallments([]);
  }
  function recalculatePackageInstallments(finalTuition) {
    const amount = Math.max(0, Math.round(Number(finalTuition || 0)));
    // Installments are intentionally maintained in Rs.10 units. While the operator is
    // still typing a non-multiple-of-10 discount, wait for blur normalization instead
    // of creating invalid micro amounts.
    if (!packageInstallments.length || amount % 10 !== 0) return;
    const count = packageInstallments.length;
    const totalUnits = amount / 10;
    const baseUnits = Math.floor(totalUnits / count);
    const remainderUnits = totalUnits - (baseUnits * count);
    setPackageInstallments(rows => rows.map((item, index) => ({
      ...item,
      amount: (baseUnits + (index === count - 1 ? remainderUnits : 0)) * 10
    })));
  }

  function updatePackageDiscount(code, value) {
    // Allow typing whole numbers, but package validation/save only accepts multiples of 10.
    if (value !== '' && !/^\d+$/.test(String(value))) return;

    // Calculate the tuition result BEFORE setPackageLines(). React state setters are
    // asynchronous, so deriving tuitionFinal inside the setter and reading it
    // immediately afterwards can leave tuitionFinal as null.
    const target = packageLines.find(line => line.feeHeadCode === code);
    let normalizedValue = value;
    let tuitionFinal = null;

    if (target) {
      if (value === '') {
        normalizedValue = '';
        if (String(target.feeHeadCode).toUpperCase() === 'TUITION') {
          tuitionFinal = Number(target.standardAmount || 0);
        }
      } else {
        normalizedValue = Math.min(
          Math.max(0, Number.parseInt(value, 10)),
          Math.trunc(Number(target.standardAmount || 0))
        );
        if (String(target.feeHeadCode).toUpperCase() === 'TUITION') {
          tuitionFinal = Math.max(0, Number(target.standardAmount || 0) - normalizedValue);
        }
      }
    }

    setPackageLines(lines => lines.map(line =>
      line.feeHeadCode === code ? { ...line, discountAmount: normalizedValue } : line
    ));

    if (tuitionFinal !== null) recalculatePackageInstallments(tuitionFinal);
  }
  function normalizeMoney10(value, max = null) {
    if (value === '') return '';
    let amount = Math.max(0, Number.parseInt(value || 0, 10) || 0);
    amount = Math.round(amount / 10) * 10;
    if (max !== null) amount = Math.min(amount, Math.floor(Number(max || 0) / 10) * 10);
    return amount;
  }
  function setPackageInstallmentCount(value) {
    const count = Math.max(1, Math.min(7, Number(value || 1)));
    setPackageInstallments(current => Array.from({ length: count }, (_, index) => current[index] || { title: `Installment ${index + 1}`, sequence: index + 1, amount: '', dueDate: '' }).map((x, index) => ({ ...x, sequence: index + 1, title: x.title || `Installment ${index + 1}` })));
  }
  function updatePackageInstallment(index, patch) {
    if (Object.prototype.hasOwnProperty.call(patch, 'amount')) {
      const value = patch.amount;
      if (value !== '' && !/^\d+$/.test(String(value))) return;
      patch = { ...patch, amount: value === '' ? '' : Math.max(0, Number.parseInt(value, 10)) };
    }
    setPackageInstallments(rows => rows.map((x, i) => i === index ? { ...x, ...patch } : x));
  }
  function splitPackageInstallments() {
    const tuition = packageLines.find(x => String(x.feeHeadCode).toUpperCase() === 'TUITION');
    const finalTuition = Math.max(0, Math.round(Number(tuition?.standardAmount || 0) - Number(tuition?.discountAmount || 0)));
    const count = Math.max(1, packageInstallments.length || 1);
    if (finalTuition % 10 !== 0) {
      setError('Final Tuition Fee must be a multiple of 10 before installments can be split.');
      return;
    }
    const totalUnits = finalTuition / 10;
    const baseUnits = Math.floor(totalUnits / count);
    const remainderUnits = totalUnits - (baseUnits * count);
    setPackageInstallments(rows => rows.map((x, i) => ({
      ...x,
      // Split in Rs.10 units. Any remainder is added to the last installment.
      // Example: 55,000 / 3 = 18,330 + 18,330 + 18,340.
      amount: (baseUnits + (i === count - 1 ? remainderUnits : 0)) * 10
    })));
  }
  const packageTotals = useMemo(() => packageLines.reduce((acc, line) => {
    const standard = Number(line.standardAmount || 0), discount = Math.min(standard, Math.max(0, Number(line.discountAmount || 0)));
    acc.standard += standard; acc.discount += discount; acc.final += standard - discount; return acc;
  }, { standard: 0, discount: 0, final: 0 }), [packageLines]);
  const packageInstallmentsValid = useMemo(() => {
    const tuition = packageLines.find(x => String(x.feeHeadCode).toUpperCase() === 'TUITION');
    if (!tuition || !['annual','semester'].includes(tuition.feeType || tuition.feeCycle)) return true;
    if (packageInstallments.length < 1 || packageInstallments.length > 7 || packageInstallments.some(x => !x.dueDate)) return false;
    if (packageLines.some(x => Number(x.discountAmount || 0) % 10 !== 0)) return false;
    if (packageInstallments.some(x => Number(x.amount || 0) % 10 !== 0)) return false;
    const finalTuition = Math.max(0, Number(tuition.standardAmount || 0) - Number(tuition.discountAmount || 0));
    if (finalTuition % 10 !== 0) return false;
    const total = packageInstallments.reduce((sum, x) => sum + Number(x.amount || 0), 0);
    return Math.abs(total - finalTuition) <= .01;
  }, [packageLines, packageInstallments]);

  async function saveStudentPackage(e) {
    e.preventDefault(); if (!packageEditor || !selectedStructureId) return;
    setBusy(true); setError('');
    try {
      const admissionId = packageEditor.admission._id;
      await api.post(`/fees/admissions/${admissionId}/student-package`, {
        feeStructureId: selectedStructureId, changeReason,
        adjustments: packageLines.map(line => ({ feeHeadCode: line.feeHeadCode, discountAmount: Number(line.discountAmount || 0) })),
        installments: packageInstallments.map((item, index) => ({ title: item.title || `Installment ${index + 1}`, sequence: index + 1, amount: Number(item.amount || 0), dueDate: item.dueDate }))
      });

      // Refresh the list and the currently open student workspace together. Previously
      // the list refreshed but selectedStudent still pointed at the pre-save object, so
      // the screen continued to show "Not Defined" until a full browser refresh.
      const [freshStudents] = await Promise.all([loadStudents(), loadPostingStudents()]);
      const refreshedStudent = freshStudents.find(row => String(row.admission?._id) === String(admissionId));
      if (refreshedStudent) {
        setSelectedStudent(refreshedStudent);
        if (refreshedStudent.plan?._id) {
          try { setSelectedStudentSummary(await fetchPostingSummary(refreshedStudent.plan._id)); }
          catch { setSelectedStudentSummary(null); }
        }
      }
      setPackageEditor(null);
    } catch (e2) { setError(getError(e2)); }
    finally { setBusy(false); }
  }

  async function fetchPostingSummary(planId) {
    const res = await api.get(`/fees/student-plans/${planId}/posting-summary`);
    return res.data;
  }
  async function openPosting(row) {
    try {
      setError(''); const summary = await fetchPostingSummary(row.plan._id); setPostingSummary(summary); setPostingEditor(row);
      const plan = summary.plan;
      if (['annual','semester'].includes(plan.billingCycle)) {
        const posted = new Set((summary.postings || []).flatMap(x => (x.lines || []).filter(line => line.sourceType === 'scheduled').map(line => Number(line.installmentSequence))).filter(Boolean));
        const next = (plan.installments || []).find(x => !posted.has(Number(x.sequence))) || plan.installments?.[0];
        setPostingForm({ periodKey: next?.dueDate ? `due-${isoDate(next.dueDate)}` : '', installmentSequence: '', scheduledAmount: '', dueDate: isoDate(next?.dueDate), remarks: '', additionalLines: [], voucherType: defaultVoucherType, selectedFeeHeadCodes: [] });
      } else {
        const now = new Date(); const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const tuition = (plan.packageLines || []).find(x => x.feeHeadCode === 'TUITION');
        setPostingForm({ periodKey: month, installmentSequence: '', scheduledAmount: tuition?.finalAmount || '', dueDate: '', remarks: '', additionalLines: [], voucherType: defaultVoucherType, selectedFeeHeadCodes: [] });
      }
    } catch (e) { setError(getError(e)); }
  }
  async function loadEligibleVoucherHeads(planId, form = postingForm) {
    if (!planId || !form?.dueDate) {
      setEligibleVoucherHeads([]);
      return;
    }
    setEligibleHeadsBusy(true);
    try {
      const res = await api.post(`/fees/student-plans/${planId}/eligible-voucher-heads`, {
        dueDate: form.dueDate,
        periodKey: form.periodKey || (form.dueDate ? `due-${form.dueDate}` : ''),
        scheduledAmount: form.scheduledAmount === '' ? undefined : Number(form.scheduledAmount)
      });
      const rows = res.data?.eligibleHeads || [];
      setEligibleVoucherHeads(rows);
      setPostingForm(prev => {
        const eligibleCodes = new Set(rows.map(row => row.feeHeadCode));
        const retained = (prev.selectedFeeHeadCodes || []).filter(code => eligibleCodes.has(code));
        if (!retained.length && eligibleCodes.has('TUITION')) retained.push('TUITION');
        return { ...prev, selectedFeeHeadCodes: retained };
      });
    } catch (e) {
      setEligibleVoucherHeads([]);
      setError(getError(e));
    } finally {
      setEligibleHeadsBusy(false);
    }
  }

  useEffect(() => {
    if (!postingEditor?.plan?._id || !postingForm.dueDate) {
      setEligibleVoucherHeads([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      loadEligibleVoucherHeads(postingEditor.plan._id, postingForm);
    }, 180);
    return () => clearTimeout(timer);
  }, [
    postingEditor?.plan?._id,
    postingForm.dueDate,
    postingForm.periodKey,
    postingForm.scheduledAmount
  ]);

  function toggleVoucherHead(code) {
    setPostingForm(prev => ({
      ...prev,
      selectedFeeHeadCodes: (prev.selectedFeeHeadCodes || []).includes(code)
        ? prev.selectedFeeHeadCodes.filter(x => x !== code)
        : [...(prev.selectedFeeHeadCodes || []), code]
    }));
  }

  function selectAnnualInstallment(sequence) {
    const item = (postingSummary?.plan?.installments || []).find(x => Number(x.sequence) === Number(sequence));
    const cycle = postingSummary?.plan?.billingCycle === 'semester' ? 'semester' : 'annual';
    setPostingForm(prev => ({ ...prev, installmentSequence: sequence, periodKey: sequence ? `${cycle}-${sequence}` : '', scheduledAmount: item?.amount || '', dueDate: isoDate(item?.dueDate) }));
  }
  function addAdditionalLine() {
    setPostingForm(prev => ({ ...prev, additionalLines: [...prev.additionalLines, { feeHeadCode: '', amount: '', description: '' }] }));
  }
  function updateAdditionalLine(index, patch) {
    setPostingForm(prev => ({ ...prev, additionalLines: prev.additionalLines.map((x, i) => i === index ? { ...x, ...patch } : x) }));
  }
  function removeAdditionalLine(index) {
    setPostingForm(prev => ({ ...prev, additionalLines: prev.additionalLines.filter((_, i) => i !== index) }));
  }
  const additionalTotal = useMemo(
    () => postingForm.additionalLines.reduce((s, x) => s + Number(x.amount || 0), 0),
    [postingForm.additionalLines]
  );
  const selectedEligibleHeads = useMemo(
    () => eligibleVoucherHeads.filter(row => (postingForm.selectedFeeHeadCodes || []).includes(row.feeHeadCode)),
    [eligibleVoucherHeads, postingForm.selectedFeeHeadCodes]
  );
  const selectedEligibleTotal = useMemo(
    () => selectedEligibleHeads.reduce((sum, row) => sum + Number(row.totalEligibleAmount || 0), 0),
    [selectedEligibleHeads]
  );
  const selectedArrearsTotal = useMemo(
    () => selectedEligibleHeads.reduce((sum, row) => sum + Number(row.arrearsAmount || 0), 0),
    [selectedEligibleHeads]
  );
  const selectedNewChargesTotal = useMemo(
    () => selectedEligibleHeads.reduce((sum, row) => sum + Number(row.scheduledAmount || 0), 0),
    [selectedEligibleHeads]
  );
  const postingPreview = selectedEligibleTotal + additionalTotal - Number(postingSummary?.plan?.advanceCredit || 0);


  const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[ch]));
  const voucherDate = value => value ? new Date(value).toLocaleDateString() : '—';

  function voucherParts(data) {
    const { posting, college } = data;
    const admission = posting.admissionApplicationId || {};
    const program = admission.programId || {};
    const session = admission.academicSessionId || {};
    const headMap = new Map((data.systemHeads || heads).map(h => [String(h.code).toUpperCase(), h.name]));
    const newLines = (posting.lines || []).map(line => ({
      title: headMap.get(String(line.feeHeadCode || '').toUpperCase()) || line.feeHeadCode,
      detail: line.description || '', amount: Number(line.amount || 0)
    }));
    const arrears = Number((posting.arrearsSnapshot || []).reduce((sum, line) => sum + Number(line.outstandingAmount || 0), 0).toFixed(2));
    const detailedArrears = (posting.arrearsSnapshot || []).map(line => ({
      title: `${headMap.get(String(line.feeHeadCode || '').toUpperCase()) || line.feeHeadCode} Arrear`,
      detail: line.description || '', amount: Number(line.outstandingAmount || 0)
    }));
    const advanceApplied = Number(posting.advanceApplied || 0);
    const collegeName = college?.displayName || college?.name || college?.shortName || 'College / School';
    const collegeContact = [college?.address, college?.phone || college?.phoneNumber, college?.email].filter(Boolean).join(' • ');
    const rawCollegeLogo = college?.logoUrl || college?.logo || '';
    const collegeLogo = rawCollegeLogo ? (() => { try { return new URL(rawCollegeLogo, window.location.origin).href; } catch (_) { return rawCollegeLogo; } })() : '';
    return { posting, admission, program, session, newLines, arrears, detailedArrears, advanceApplied, collegeName, collegeContact, collegeLogo };
  }

  function bankVoucherHtml(data) {
    const { posting, admission, program, session, newLines, detailedArrears, advanceApplied, collegeName, collegeContact, collegeLogo } = voucherParts(data);
    const lines = [...detailedArrears, ...newLines];
    const rows = lines.map((line, i) => `<tr><td>${i + 1}</td><td><b>${esc(line.title)}</b>${line.detail ? `<small>${esc(line.detail)}</small>` : ''}</td><td class="amt">${money(line.amount)}</td></tr>`).join('') + (advanceApplied > 0 ? `<tr><td></td><td><b>Advance Credit Applied</b></td><td class="amt">-${money(advanceApplied)}</td></tr>` : '');
    return `<section class="bank-voucher">
      <header>${collegeLogo ? `<img class="voucher-logo" src="${esc(collegeLogo)}" alt="Logo">` : ''}<div><h1>${esc(collegeName)}</h1><p>${esc(collegeContact)}</p><h2>BANK FEE VOUCHER</h2></div></header>
      <div class="bank-meta"><span><b>Voucher No:</b> ${esc(posting.voucherNo)}</span><span><b>Issue Date:</b> ${voucherDate(posting.postingDate || posting.createdAt)}</span><span><b>Due Date:</b> ${voucherDate(posting.dueDate)}</span><span><b>Batch:</b> ${esc(posting.batchNo || 'Individual')}</span></div>
      <div class="bank-student"><span><b>Roll / Form No:</b> ${esc(admission.rollNo || admission.formNo || '')}</span><span><b>Name:</b> ${esc(admission.studentName || '')}</span><span><b>Father Name:</b> ${esc(admission.fatherName || '')}</span><span><b>Program / Class:</b> ${esc(program.name || '')}</span><span><b>Session:</b> ${esc(session.name || '')}</span></div>
      <table><thead><tr><th>Sr</th><th>Fee Head / Particular</th><th>Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No fee lines</td></tr>'}</tbody><tfoot><tr><td colspan="2">TOTAL</td><td class="amt">${money(posting.voucherAmount)}</td></tr></tfoot></table>
      <div class="amount-words"><b>Amount in Words:</b> ${esc(amountInWords(posting.voucherAmount))}</div>
      <div class="bank-note">Please deposit on or before the due date. The student ledger remains the final record of fee liability and payments.</div>
      <div class="bank-signatures"><span>Depositor Signature</span><span>Bank / Cashier Stamp</span><span>Accounts Office</span></div>
    </section>`;
  }

  function cashVoucherHtml(data) {
    const { posting, admission, newLines, arrears, advanceApplied, collegeName, collegeLogo } = voucherParts(data);
    let serial = 1;
    const rows = newLines.map(line => `<tr><td>${serial++}</td><td>${esc(line.title)}</td><td class="amt">${money(line.amount)}</td></tr>`).join('')
      + (arrears > 0 ? `<tr><td>${serial++}</td><td>Arrears</td><td class="amt">${money(arrears)}</td></tr>` : '')
      + (advanceApplied > 0 ? `<tr><td>${serial++}</td><td>Advance Credit Applied</td><td class="amt">-${money(advanceApplied)}</td></tr>` : '');
    return `<section class="cash-voucher">
      <div class="cash-brand">${collegeLogo ? `<img class="voucher-logo" src="${esc(collegeLogo)}" alt="Logo">` : ''}<div><h1>${esc(collegeName)}</h1><h2>FEE VOUCHER</h2></div></div>
      <div class="cash-top"><span><b>Issue Date</b> ${voucherDate(posting.postingDate || posting.createdAt)}</span><span><b>Due Date</b> ${voucherDate(posting.dueDate)}</span></div>
      <div class="cash-student"><span><b>Name</b> ${esc(admission.studentName || '')}</span><span><b>Father Name</b> ${esc(admission.fatherName || '')}</span></div>
      <div class="cash-ref"><span>Voucher No: ${esc(posting.voucherNo)}</span><span>Roll/Form: ${esc(admission.rollNo || admission.formNo || '')}</span></div>
      <table><thead><tr><th>Sr</th><th>Fee Head</th><th>Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No fee lines</td></tr>'}</tbody><tfoot><tr><td></td><td>Total</td><td class="amt">${money(posting.voucherAmount)}</td></tr></tfoot></table>
      <div class="cash-words"><b>Amount in Words:</b> ${esc(amountInWords(posting.voucherAmount))}</div>
      <div class="cash-sign"><span>Received By / Stamp</span><span>Signature</span></div>
    </section>`;
  }

  function voucherPrintDocument(details, title = 'Fee Voucher') {
    const vouchers = Array.isArray(details) ? details : [details];
    const allCash = vouchers.length && vouchers.every(v => String(v.posting?.voucherType || 'bank') === 'cash');
    let body = '';
    if (allCash) {
      for (let i = 0; i < vouchers.length; i += 3) {
        body += `<div class="cash-sheet">${vouchers.slice(i, i + 3).map(cashVoucherHtml).join('')}</div>`;
      }
    } else {
      body = vouchers.map(v => String(v.posting?.voucherType || 'bank') === 'cash'
        ? `<div class="cash-sheet single">${cashVoucherHtml(v)}</div>`
        : `<div class="bank-sheet">${bankVoucherHtml(v)}</div>`).join('');
    }
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111;background:#fff}.amt{text-align:right;white-space:nowrap}
      .bank-sheet{height:281mm;page-break-after:always}.bank-sheet:last-child{page-break-after:auto}.bank-voucher{height:100%;border:1.5px solid #111;padding:8mm;position:relative}.bank-voucher header{display:flex;align-items:center;justify-content:center;gap:5mm;text-align:center;border-bottom:2px solid #111;padding-bottom:4mm}.voucher-logo{width:18mm;height:18mm;object-fit:contain}.amount-words{font-size:10px;margin-top:4mm;padding:3mm;border:1px solid #aaa}.bank-voucher h1{font-size:22px;margin:0}.bank-voucher h2{font-size:17px;letter-spacing:1px;margin:4px 0 0}.bank-voucher header p{font-size:10px;margin:3px 0}.bank-meta,.bank-student{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 12px;font-size:11px;padding:5mm 0;border-bottom:1px solid #aaa}.bank-voucher table{width:100%;border-collapse:collapse;margin-top:5mm;font-size:11px}.bank-voucher th,.bank-voucher td{border:1px solid #555;padding:7px}.bank-voucher th:first-child,.bank-voucher td:first-child{width:12mm;text-align:center}.bank-voucher td small{display:block;font-size:9px;color:#555}.bank-voucher tfoot td{font-weight:800;font-size:12px}.bank-note{font-size:9px;margin-top:5mm}.bank-signatures{position:absolute;left:8mm;right:8mm;bottom:10mm;display:grid;grid-template-columns:repeat(3,1fr);gap:10mm;text-align:center;font-size:9px}.bank-signatures span{border-top:1px solid #333;padding-top:3mm}
      .cash-sheet{height:281mm;display:grid;grid-template-rows:repeat(3,1fr);gap:3mm;page-break-after:always}.cash-sheet:last-child{page-break-after:auto}.cash-sheet.single{display:block}.cash-sheet.single .cash-voucher{height:90mm}.cash-voucher{border:1.4px solid #111;padding:3mm 4mm;position:relative;overflow:hidden}.cash-brand{display:flex;align-items:center;justify-content:center;gap:3mm}.cash-brand .voucher-logo{width:12mm;height:12mm}.cash-voucher h1{text-align:center;font-size:15px;margin:0}.cash-voucher h2{text-align:center;font-size:12px;margin:2px 0 4px;letter-spacing:.8px}.cash-top,.cash-student,.cash-ref{display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:8.5px;margin-bottom:3px}.cash-top span:nth-child(even){text-align:right}.cash-voucher table{width:100%;border-collapse:collapse;font-size:8.5px}.cash-voucher th,.cash-voucher td{border:1px solid #555;padding:3px 4px}.cash-voucher th:first-child,.cash-voucher td:first-child{width:8mm;text-align:center}.cash-voucher tfoot td{font-weight:800}.cash-words{font-size:7.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cash-sign{position:absolute;left:4mm;right:4mm;bottom:3mm;display:grid;grid-template-columns:1fr 1fr;gap:25mm;text-align:center;font-size:7.5px}.cash-sign span{border-top:1px solid #444;padding-top:2mm}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>${body}</body></html>`;
  }

  async function printVoucher(voucherId) {
    const win = window.open('', '_blank', 'width=1200,height=850');
    if (!win) { setError('Pop-up blocked. Please allow pop-ups to print the voucher.'); return; }
    win.document.write('<p style="font-family:Arial;padding:20px">Loading voucher...</p>');
    try {
      const res = await api.get(`/fees/posting/vouchers/${voucherId}`);
      win.document.open(); win.document.write(voucherPrintDocument(res.data, res.data.posting?.voucherNo || 'Fee Voucher')); win.document.close();
      win.focus(); setTimeout(() => win.print(), 250);
    } catch (e) { win.close(); setError(getError(e)); }
  }

  async function printVoucherBatch(batchNo) {
    const rows = generatedVouchers.filter(v => String(v.batchNo || '') === String(batchNo || ''));
    if (!rows.length) return;
    const win = window.open('', '_blank', 'width=1200,height=850');
    if (!win) { setError('Pop-up blocked. Please allow pop-ups to print the voucher batch.'); return; }
    win.document.write('<p style="font-family:Arial;padding:20px">Loading voucher batch...</p>');
    try {
      const responses = await Promise.all(rows.map(v => api.get(`/fees/posting/vouchers/${v._id}`)));
      win.document.open(); win.document.write(voucherPrintDocument(responses.map(r => r.data), batchNo)); win.document.close();
      win.focus(); setTimeout(() => win.print(), 250);
    } catch (e) { win.close(); setError(getError(e)); }
  }

  async function createPosting(e) {
    e.preventDefault(); if (!postingEditor) return; setBusy(true); setError('');
    try {
      const res = await api.post(`/fees/student-plans/${postingEditor.plan._id}/postings`, {
        ...postingForm,
        installmentSequence: postingForm.installmentSequence ? Number(postingForm.installmentSequence) : undefined,
        scheduledAmount: postingForm.scheduledAmount === '' ? undefined : Number(postingForm.scheduledAmount),
        selectedFeeHeadCodes: postingForm.selectedFeeHeadCodes || [],
        additionalLines: postingForm.additionalLines.filter(x => x.feeHeadCode && Number(x.amount) > 0).map(x => ({ ...x, amount: Number(x.amount) }))
      });
      setPostingEditor(null); setPostingSummary(null); await Promise.all([loadPostingStudents(), loadFeeVouchers()]); if (selectedStudent?.plan?._id) await refreshSelectedStudent();
    } catch (e2) { setError(getError(e2)); }
    finally { setBusy(false); }
  }

  async function openPayment(row, voucherNo = '') {
    try {
      setError('');
      const summary = await fetchPostingSummary(row.plan._id);
      const scopedSummary = voucherNo
        ? { ...summary, openLines: (summary.openLines || []).filter(line => String(line.voucherNo || '') === String(voucherNo)) }
        : summary;
      setPaymentSummary(scopedSummary);
      setPaymentEditor({ ...row, voucherNo: voucherNo || '' });
      setPayValues({}); setAdvanceAmount(''); setPaymentDate(new Date().toISOString().slice(0, 10)); setPaymentMethod('cash'); setChallanNo('');
    } catch (e) { setError(getError(e)); }
  }

  function openVoucherPosting(voucher) {
    const planId = String(voucher.studentFeePlanId?._id || voucher.studentFeePlanId || '');
    const row = postingStudents.find(item => String(item.plan?._id || '') === planId);
    if (!row?.plan?._id) { setError('Student fee plan could not be found for this voucher.'); return; }
    openPayment(row, voucher.voucherNo);
  }
  const allocationTotal = useMemo(() => Object.values(payValues).reduce((s, x) => s + Number(x || 0), 0), [payValues]);
  const receiptTotal = allocationTotal + Number(advanceAmount || 0);
  async function savePayment(e) {
    e.preventDefault(); if (!paymentEditor || receiptTotal <= 0) return; setBusy(true); setError('');
    try {
      const allocations = (paymentSummary?.openLines || []).map(line => ({
        postingId: line.postingId, lineId: line.lineId, feeHeadCode: line.feeHeadCode,
        amount: Number(payValues[`${line.postingId}:${line.lineId}`] || 0)
      })).filter(x => x.amount > 0);
      await api.post(`/fees/student-plans/${paymentEditor.plan._id}/allocated-payments`, {
        amount: receiptTotal, allocations, paymentDate, paymentMethod, challanNo
      });
      setPaymentEditor(null); setPaymentSummary(null); await Promise.all([loadPostingStudents(), loadStudents(), loadFeeVouchers()]); if (selectedStudent?.plan?._id) await refreshSelectedStudent();
    } catch (e2) { setError(getError(e2)); }
    finally { setBusy(false); }
  }


  async function openStudentDetails(row) {
    setSelectedStudent(row);
    setStudentDetailTab('package');
    setSelectedStudentSummary(null);
    setError('');
    if (!row?.plan?._id) return;
    try {
      const summary = await fetchPostingSummary(row.plan._id);
      setSelectedStudentSummary(summary);
    } catch (e) { setError(getError(e)); }
  }

  async function refreshSelectedStudent() {
    if (!selectedStudent?.plan?._id) return;
    try {
      const summary = await fetchPostingSummary(selectedStudent.plan._id);
      setSelectedStudentSummary(summary);
      await Promise.all([loadStudents(), loadPostingStudents(), loadFeeVouchers()]);
    } catch (e) { setError(getError(e)); }
  }

  const selectedPostingRow = useMemo(() => {
    const planId = selectedStudent?.plan?._id;
    return planId ? postingStudents.find(row => String(row.plan?._id) === String(planId)) : null;
  }, [selectedStudent, postingStudents]);

  const selectedVouchers = useMemo(() => {
    const planId = selectedStudent?.plan?._id;
    if (!planId) return [];
    return generatedVouchers.filter(v => String(v.studentFeePlanId?._id || v.studentFeePlanId || '') === String(planId));
  }, [selectedStudent, generatedVouchers]);

  const selectedLedgerRows = useMemo(() => {
    const summary = selectedStudentSummary;
    if (!summary) return [];
    const rows = [];
    (summary.postings || []).forEach(posting => {
      (posting.lines || []).forEach(line => rows.push({
        date: posting.postingDate || posting.createdAt,
        particular: line.description || posting.voucherNo || 'Fee Posting',
        feeHead: headName(line.feeHeadCode),
        debit: Number(line.amount || 0),
        credit: 0,
        order: new Date(posting.postingDate || posting.createdAt || 0).getTime()
      }));
    });
    (summary.payments || []).forEach(payment => {
      if ((payment.allocations || []).length) {
        payment.allocations.forEach(allocation => rows.push({
          date: payment.paymentDate || payment.createdAt,
          particular: `Payment ${payment.receiptNo || ''}`.trim(),
          feeHead: headName(allocation.feeHeadCode),
          debit: 0,
          credit: Number(allocation.amount || 0),
          order: new Date(payment.paymentDate || payment.createdAt || 0).getTime()
        }));
      } else {
        rows.push({
          date: payment.paymentDate || payment.createdAt,
          particular: `Payment ${payment.receiptNo || ''}`.trim(),
          feeHead: 'Payment',
          debit: 0,
          credit: Number(payment.amount || 0),
          order: new Date(payment.paymentDate || payment.createdAt || 0).getTime()
        });
      }
    });
    rows.sort((a, b) => a.order - b.order);
    let balance = 0;
    return rows.map(row => {
      balance = Number((balance + row.debit - row.credit).toFixed(2));
      return { ...row, balance };
    });
  }, [selectedStudentSummary, heads]);

  function toggleBulkProgram(id) {
    setBulkVoucher(prev => ({ ...prev, programIds: prev.programIds.includes(id) ? prev.programIds.filter(x => x !== id) : [...prev.programIds, id] }));
  }
  function toggleBulkFeeHead(code) {
    setBulkVoucher(prev => ({
      ...prev,
      selectedFeeHeadCodes: (prev.selectedFeeHeadCodes || []).includes(code)
        ? prev.selectedFeeHeadCodes.filter(x => x !== code)
        : [...(prev.selectedFeeHeadCodes || []), code]
    }));
  }
  const bulkVoucherPrograms = useMemo(() => {
    if (!bulkVoucher.academicSessionId) return [];
    const allowed = new Set();
    structures.forEach(s => {
      const sessionId = String(s.academicSessionId?._id || s.academicSessionId || '');
      if (sessionId !== String(bulkVoucher.academicSessionId)) return;
      (s.programIds || []).forEach(p => allowed.add(String(p?._id || p)));
    });
    return programs.filter(p => allowed.has(String(p._id)));
  }, [bulkVoucher.academicSessionId, programs, structures]);

  function changeBulkVoucherSession(academicSessionId) {
    setBulkVoucher(prev => ({ ...prev, academicSessionId, programIds: [] }));
  }

  async function createBulkVouchers(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const res = await api.post('/fees/posting/bulk', {
        academicSessionId: bulkVoucher.academicSessionId,
        programIds: bulkVoucher.programIds,
        dueDate: bulkVoucher.dueDate,
        periodKey: bulkVoucher.dueDate ? `due-${bulkVoucher.dueDate}` : '',
        voucherType: bulkVoucher.voucherType || 'bank',
        selectedFeeHeadCodes: bulkVoucher.selectedFeeHeadCodes || [],
        additionalLines: bulkVoucher.additionalLines.filter(x => x.feeHeadCode && Number(x.amount) > 0).map(x => ({ ...x, amount: Number(x.amount) }))
      });
      const skippedRows = res.data.skippedRows || [];
      const skippedText = skippedRows.length
        ? `\n\nSkipped details:\n${skippedRows.map((row,index)=>`${index+1}. ${row.rollNo || row.formNo || row.studentName || 'Student'} — ${row.reason}`).join('\n')}`
        : '';
      window.alert(`Bulk voucher batch ${res.data.batchNo}: ${res.data.generated} generated, ${res.data.skipped} skipped.${skippedText}`);
      if (res.data.generated > 0) {
        setShowBulkVoucher(false);
        setBulkVoucher({ academicSessionId: '', programIds: [], dueDate: '', additionalLines: [], voucherType: defaultVoucherType, selectedFeeHeadCodes: [] });
      }
      await Promise.all([loadPostingStudents(), loadFeeVouchers()]);
    } catch (e2) { setError(getError(e2)); }
    finally { setBusy(false); }
  }

  const norm = value => String(value || '').trim().toLowerCase();
  const listFilterMatch = (admission, filters) => {
    if (!admission) return false;
    const sessionId = String(admission.academicSessionId?._id || admission.academicSessionId || '');
    const programId = String(admission.programId?._id || admission.programId || '');
    if (filters.academicSessionId && sessionId !== String(filters.academicSessionId)) return false;
    if (filters.programId && programId !== String(filters.programId)) return false;
    if (filters.rollNo && !norm(admission.rollNo).includes(norm(filters.rollNo))) return false;
    if (filters.formNo && !norm(admission.formNo).includes(norm(filters.formNo))) return false;
    if (filters.name && !norm(admission.studentName).includes(norm(filters.name))) return false;
    if (filters.fatherName && !norm(admission.fatherName).includes(norm(filters.fatherName))) return false;
    return true;
  };
  const filteredStudents = useMemo(() => students.filter(row => listFilterMatch(row.admission, studentFilters)), [students, studentFilters]);
  const filteredGeneratedVouchers = useMemo(() => {
    const q = norm(voucherSearch);
    if (!q) return generatedVouchers;
    return generatedVouchers.filter(v => {
      const admission = v.admissionApplicationId || {};
      const haystack = [
        v.voucherNo,
        v.voucherType === 'cash' ? 'Cash' : 'Bank',
        admission.studentName,
        admission.fatherName,
        admission.rollNo,
        admission.formNo,
        admission.programId?.name,
        isoDate(v.dueDate),
        money(v.voucherAmount),
        v.status
      ].map(norm).join(' ');
      return haystack.includes(q);
    });
  }, [generatedVouchers, voucherSearch]);

  async function generateReport() {
    setBusy(true); setError('');
    try {
      const params = Object.fromEntries(Object.entries(reportFilters).filter(([,v]) => v));
      const res = await api.get(`/fees/reports/${reportType}`, { params });
      setReportResult(res.data || null);
    } catch (e) { setError(getError(e)); }
    finally { setBusy(false); }
  }

  function reportColumns(type) {
    if (type === 'defaulters' || type === 'outstanding-dues') return [['rollNo','Roll No'],['studentName','Student'],['fatherName','Father Name'],['program','Program / Class'],['totalDue','Due'],['paid','Paid'],['outstanding','Outstanding']];
    if (type === 'collections') return [['receiptNo','Receipt No'],['challanNo','Challan / Slip'],['date','Date'],['rollNo','Roll No'],['studentName','Student'],['program','Program / Class'],['amount','Amount'],['method','Method']];
    if (type === 'voucher-status') return [['voucherNo','Voucher No'],['type','Type'],['date','Issue Date'],['dueDate','Due Date'],['rollNo','Roll No'],['studentName','Student'],['program','Program / Class'],['amount','Amount'],['status','Status']];
    if (type === 'fee-head-collection') return [['feeHeadCode','Code'],['feeHead','Fee Head'],['amount','Collected']];
    return [];
  }

  function reportCell(key, value) {
    if (['amount','totalDue','paid','outstanding'].includes(key)) return money(value);
    if (['date','dueDate'].includes(key)) return isoDate(value);
    return String(value ?? '');
  }

  function printReport() {
    if (!reportResult?.rows) return;
    const cols = reportColumns(reportType);
    const win = window.open('', '_blank', 'width=1200,height=850');
    if (!win) { setError('Pop-up blocked. Please allow pop-ups to print the report.'); return; }
    const rows = reportResult.rows.map(row => `<tr>${cols.map(([key])=>`<td>${esc(reportCell(key,row[key]))}</td>`).join('')}</tr>`).join('');
    const total = reportResult.total !== undefined ? `<p class="total"><b>Total:</b> ${money(reportResult.total)}</p>` : '';
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(reportResult.title||'Fee Report')}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111}h1{margin:0 0 4px;font-size:20px}p{font-size:11px;color:#555}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:10px}th,td{border:1px solid #777;padding:6px;text-align:left}th{background:#eee}.total{text-align:right;font-size:13px}</style></head><body><h1>${esc(reportResult.title||'Fee Report')}</h1><p>Generated: ${esc(new Date(reportResult.generatedAt||Date.now()).toLocaleString())}</p>${reportResult.cutoff?`<p>Cut-off: ${esc(isoDate(reportResult.cutoff))}</p>`:''}<table><thead><tr>${cols.map(([,label])=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${cols.length}">No records</td></tr>`}</tbody></table>${total}</body></html>`);
    win.document.close(); win.focus(); setTimeout(()=>win.print(),250);
  }

  const structurePager = usePagination(structures);
  const studentPager = usePagination(filteredStudents, JSON.stringify(studentFilters));
  const ledgerPager = usePagination(selectedLedgerRows, selectedStudent?._id || selectedStudent?.admission?._id || '');
  const studentVoucherPager = usePagination(selectedVouchers, selectedStudent?._id || selectedStudent?.admission?._id || '');
  const paymentPager = usePagination(selectedStudentSummary?.payments || [], selectedStudent?._id || selectedStudent?.admission?._id || '');
  const voucherPager = usePagination(filteredGeneratedVouchers, voucherSearch);
  const reportPager = usePagination(reportResult?.rows || [], `${reportType}|${JSON.stringify(reportFilters)}`);

  const renderFilters = (filters, setFilters) => <div className="fee-list-filters fee-list-filters-two-level">
    <div className="fee-filter-level fee-filter-level-primary">
      <label><span>Session</span><select value={filters.academicSessionId} onChange={e => setFilters({ ...filters, academicSessionId: e.target.value })}><option value="">All Sessions</option>{sessions.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
      <label><span>Program / Class</span><select value={filters.programId} onChange={e => setFilters({ ...filters, programId: e.target.value })}><option value="">All Programs / Classes</option>{programs.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
    </div>
    <div className="fee-filter-level fee-filter-level-secondary">
      <label><span>Roll No</span><input value={filters.rollNo} onChange={e => setFilters({ ...filters, rollNo: e.target.value })} placeholder="Roll No" /></label>
      <label><span>Form No</span><input value={filters.formNo} onChange={e => setFilters({ ...filters, formNo: e.target.value })} placeholder="Form No" /></label>
      <label><span>Name</span><input value={filters.name} onChange={e => setFilters({ ...filters, name: e.target.value })} placeholder="Student name" /></label>
      <label><span>Father Name</span><input value={filters.fatherName} onChange={e => setFilters({ ...filters, fatherName: e.target.value })} placeholder="Father name" /></label>
      <button type="button" className="secondary fee-filter-clear" onClick={() => setFilters(emptyListFilters)}>Clear</button>
    </div>
  </div>;

  return (
    <div className="fee-page">
      <div className="module-top-tabs">
        <button className={tab === 'student-details' ? 'active' : ''} onClick={() => { setTab('student-details'); setSelectedStudent(null); setSelectedStudentSummary(null); }}>Student Fee Details</button>
        <button className={tab === 'generate-vouchers' ? 'active' : ''} onClick={() => setTab('generate-vouchers')}>Vouchers &amp; Postings</button>
        <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Reports</button>
        <button className={tab === 'structures' ? 'active' : ''} onClick={() => setTab('structures')}>Fee Structure</button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === 'structures' && <>
        <div className="fee-structure-subtabs">
          <button type="button" className={structureSubTab === 'structures' ? 'active' : ''} onClick={() => setStructureSection('structures')}>Fee Structure</button>
          <button type="button" className={structureSubTab === 'default-installments' ? 'active' : ''} onClick={() => setStructureSection('default-installments')}>Default Installments</button>
        </div>

        {structureSubTab === 'default-installments' ? <>
<div className="fee-title-row"><div><h2>Default Installments</h2><p className="muted">Set the default Tuition installment count and reference dates for each Session and Program / Class. New student packages use these as a planning reference; the actual Due Date is selected when each voucher is generated.</p></div>{!showDefaultInstallmentEditor&&<button type="button" className="fee-primary-action" onClick={()=>{setDefaultInstallmentForm({ academicSessionId:'', programId:'', installments:[{ title:'Installment 1', sequence:1, dueDate:'' }] });setShowDefaultInstallmentEditor(true);}}>+ Set Default Installments</button>}</div>
        {showDefaultInstallmentEditor&&<form className="fee-default-installment-card" onSubmit={saveDefaultInstallments}>
          <div className="fee-default-installment-selectors">
            <label><span>Session *</span><select required value={defaultInstallmentForm.academicSessionId} onChange={e => { const v=e.target.value; loadDefaultInstallmentForm(v, defaultInstallmentForm.programId); }}><option value="">Select Session</option>{sessions.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
            <label><span>Program / Class *</span><select required value={defaultInstallmentForm.programId} onChange={e => { const v=e.target.value; loadDefaultInstallmentForm(defaultInstallmentForm.academicSessionId, v); }}><option value="">Select Program / Class</option>{programs.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
            <label><span>Installments</span><select value={defaultInstallmentForm.installments.length} onChange={e => setDefaultInstallmentCount(e.target.value)}>{[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>
          <div className="fee-table-wrap"><table><thead><tr><th>#</th><th>Title</th><th>Default Reference Date</th></tr></thead><tbody>{defaultInstallmentForm.installments.map((item,index)=><tr key={index}><td>{index+1}</td><td><input value={item.title} onChange={e => setDefaultInstallmentForm(prev => ({...prev, installments:prev.installments.map((x,i)=>i===index?{...x,title:e.target.value}:x)}))} /></td><td><input required type="date" value={isoDate(item.dueDate)} onChange={e => setDefaultInstallmentForm(prev => ({...prev, installments:prev.installments.map((x,i)=>i===index?{...x,dueDate:e.target.value}:x)}))} /></td></tr>)}</tbody></table></div>
          <div className="fee-default-installment-actions"><button type="button" className="secondary" onClick={()=>setShowDefaultInstallmentEditor(false)}>Cancel</button><button disabled={busy || !defaultInstallmentForm.academicSessionId || !defaultInstallmentForm.programId}>{busy ? 'Saving...' : 'Save Default Installments'}</button></div>
        </form>}
        <div className="fee-section-title-row"><div><h3>Configured Defaults</h3><p className="muted">One schedule per Session and Program / Class.</p></div></div>
        <div className="fee-table-wrap"><table><thead><tr><th>Session</th><th>Program / Class</th><th>Installments</th><th>Reference Dates</th><th>Action</th></tr></thead><tbody>{defaultInstallmentPlans.map(row=><tr key={row._id}><td>{row.academicSessionId?.name || '—'}</td><td>{row.programId?.name || '—'}</td><td>{row.installments?.length || 0}</td><td>{(row.installments || []).map(x=>isoDate(x.dueDate)).join(', ') || '—'}</td><td><button type="button" onClick={()=>loadDefaultInstallmentForm(row.academicSessionId?._id || row.academicSessionId, row.programId?._id || row.programId)}>Edit</button></td></tr>)}{!defaultInstallmentPlans.length&&<tr><td colSpan="5">No default installment schedules configured.</td></tr>}</tbody></table></div>
        </> : <>
<div className="fee-title-row"><div><h2>Fee Structure</h2><p className="muted">Define the standard amount and recurrence type per Fee Head for one or multiple Classes / Programs.</p></div>{structureCreator && <button className="fee-primary-action" onClick={openNewStructure}>+ New Fee Structure</button>}</div>
        <div className="fee-table-wrap"><table><thead><tr><th>Structure</th><th>Session</th><th>Classes / Programs</th><th>Fee Heads</th><th>Total</th><th>Status</th><th>Created By / On</th><th>Approved By / On</th><th>Actions</th></tr></thead><tbody>
          {structurePager.rows.map(row => <tr key={row._id}><td>{row.name}</td><td>{row.academicSessionId?.name || '—'}</td><td>{(row.programIds || []).map(p => p.name).join(', ')}</td><td>{(row.feeLines || []).filter(x => Number(x.amount || 0) > 0).length}</td><td>{money(row.totalAmount)}</td><td><span className={`fee-status ${row.approvalStatus}`}>{String(row.approvalStatus).replaceAll('_', ' ')}</span></td><td>{row.createdBy?.name || '—'}<small>{row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}</small></td><td>{row.approvedBy?.name || '—'}<small>{row.approvedAt ? new Date(row.approvedAt).toLocaleString() : ''}</small></td><td><div className="row-actions">{canEditFeeStructure && row.approvalStatus !== 'inactive' && <button onClick={() => openEditStructure(row)}>Edit</button>}{approver && row.approvalStatus === 'pending_approval' && <><button onClick={() => decideStructure('approve', row)}>Approve</button><button className="danger" onClick={() => decideStructure('reject', row)}>Reject</button></>}</div></td></tr>)}
          {!structures.length && <tr><td colSpan="9">No Fee Structures defined.</td></tr>}
        </tbody></table></div><Pagination {...structurePager} />
        </>}
      </>}
      {tab === 'student-details' && <>
        <div className="fee-section-title-row"><div><h2>Student Fee Details</h2><p className="muted">Search a student and open one complete fee workspace for package, ledger, vouchers and payments.</p></div>{selectedStudent && <button type="button" className="secondary" onClick={() => { setSelectedStudent(null); setSelectedStudentSummary(null); }}>← Back to Student List</button>}</div>
        {!selectedStudent ? <>
          {renderFilters(studentFilters, setStudentFilters)}
          <div className="fee-table-wrap"><table><thead><tr><th>Form No</th><th>Roll No</th><th>Student</th><th>Father Name</th><th>Program / Class</th><th>Session</th><th>Package</th><th>Balance</th><th>Action</th></tr></thead><tbody>
            {studentPager.rows.map(row => { const postingRow = row.plan ? postingStudents.find(x => String(x.plan?._id) === String(row.plan?._id)) : null; return <tr key={row.admission._id}><td><strong>{row.admission.formNo || '—'}</strong></td><td><strong>{row.admission.rollNo || '—'}</strong></td><td>{row.admission.studentName}</td><td>{row.admission.fatherName || '—'}</td><td>{row.admission.programId?.name || '—'}</td><td>{row.admission.academicSessionId?.name || '—'}</td><td>{row.plan ? money(row.plan.totalAmount) : '—'}</td><td>{row.plan ? money(postingRow?.openBalance || 0) : '—'}</td><td><button type="button" onClick={() => openStudentDetails(row)}>View Details</button></td></tr>; })}
            {!filteredStudents.length && <tr><td colSpan="9">No students match the selected filters.</td></tr>}
          </tbody></table></div><Pagination {...studentPager} />
        </> : <>
          <div className="fee-student-basic-card">
            <div className="fee-student-wide"><span>Student Name</span><strong>{selectedStudent.admission.studentName}</strong></div>
            <div className="fee-student-wide"><span>Father Name</span><strong>{selectedStudent.admission.fatherName || '—'}</strong></div>
            <div><span>Roll No</span><strong>{selectedStudent.admission.rollNo || '—'}</strong></div>
            <div><span>Form No</span><strong>{selectedStudent.admission.formNo || '—'}</strong></div>
            <div><span>Program / Class</span><strong>{selectedStudent.admission.programId?.name || '—'}</strong></div>
            <div><span>Session</span><strong>{selectedStudent.admission.academicSessionId?.name || '—'}</strong></div>
            <div className="fee-student-financial"><span>Package</span><strong>{selectedStudent.plan ? money(selectedStudent.plan.totalAmount) : 'Not Defined'}</strong></div>
            <div className="fee-student-financial"><span>Posted</span><strong>{money(selectedPostingRow?.plan?.totalPosted || selectedStudentSummary?.plan?.totalPosted || 0)}</strong></div>
            <div className="fee-student-financial"><span>Paid</span><strong>{money(selectedPostingRow?.plan?.totalPaid || selectedStudentSummary?.plan?.totalPaid || 0)}</strong></div>
            <div className="fee-student-financial fee-student-balance"><span>Balance</span><strong>{money(selectedPostingRow?.openBalance || 0)}</strong></div>
          </div>
          <div className="fee-student-subnav">
            <button className={studentDetailTab === 'package' ? 'active' : ''} onClick={() => setStudentDetailTab('package')}>Fee Package</button>
            <button disabled={!selectedStudent.plan} className={studentDetailTab === 'ledger' ? 'active' : ''} onClick={() => setStudentDetailTab('ledger')}>Fee Ledger</button>
            <button disabled={!selectedStudent.plan} className={studentDetailTab === 'vouchers-payments' ? 'active' : ''} onClick={() => setStudentDetailTab('vouchers-payments')}>Vouchers &amp; Payments</button>
          </div>

          {studentDetailTab === 'package' && <div className="fee-workspace-panel">
            <div className="fee-section-title-row"><div><h3>Fee Package</h3><p className="muted">Student-specific fee amounts, discounts and tuition installment schedule.</p></div><button type="button" onClick={() => openPackageEditor(selectedStudent)}>{selectedStudent.plan ? 'Edit Package' : 'Define Package'}</button></div>
            {selectedStudent.plan ? <div className="fee-package-summary-grid"><div><span>Standard Fee</span><strong>{money(selectedStudent.plan.totalStandardAmount)}</strong></div><div><span>Student Package</span><strong>{money(selectedStudent.plan.totalAmount)}</strong></div><div><span>Total Paid</span><strong>{money(selectedStudent.plan.totalPaid)}</strong></div><div><span>Advance</span><strong>{money(selectedStudent.plan.advanceCredit)}</strong></div></div> : <p className="muted">No student fee package has been defined yet.</p>}
          </div>}

          {studentDetailTab === 'ledger' && <div className="fee-workspace-panel">
            <div className="fee-section-title-row"><div><h3>Fee Ledger</h3><p className="muted">Fee-head-wise postings and payments in chronological order.</p></div><button type="button" className="secondary" onClick={refreshSelectedStudent}>Refresh</button></div>
            <div className="fee-table-wrap"><table><thead><tr><th>Date</th><th>Particular</th><th>Fee Head</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
              {ledgerPager.rows.map((row, index) => <tr key={index}><td>{isoDate(row.date)}</td><td>{row.particular}</td><td>{row.feeHead}</td><td>{row.debit ? money(row.debit) : '—'}</td><td>{row.credit ? money(row.credit) : '—'}</td><td><strong>{money(row.balance)}</strong></td></tr>)}
              {!selectedLedgerRows.length && <tr><td colSpan="6">No fee ledger entries yet.</td></tr>}
            </tbody></table></div><Pagination {...ledgerPager} />
          </div>}

          {studentDetailTab === 'vouchers-payments' && <div className="fee-workspace-panel">
            <div className="fee-section-title-row"><div><h3>Vouchers &amp; Payments</h3><p className="muted">Generate or print vouchers and post payments from one workspace.</p></div><div className="row-actions"><button type="button" onClick={() => openPosting(selectedPostingRow || { plan: selectedStudent.plan })}>+ Generate Voucher</button><button type="button" className="secondary" onClick={() => openPayment(selectedPostingRow || { plan: selectedStudent.plan })}>+ Post Payment</button></div></div>
            <div className="fee-table-wrap"><table><thead><tr><th>Voucher No</th><th>Type</th><th>Issue Date</th><th>Due Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
              {studentVoucherPager.rows.map(v => <tr key={v._id}><td><strong>{v.voucherNo}</strong></td><td>{v.voucherType === 'cash' ? 'Cash' : 'Bank'}</td><td>{isoDate(v.postingDate || v.createdAt)}</td><td>{isoDate(v.dueDate)}</td><td>{money(v.voucherAmount)}</td><td><span className={`fee-voucher-status ${v.status}`}>{v.status}</span></td><td><div className="row-actions"><button type="button" onClick={() => printVoucher(v._id)}>Print</button>{String(v.status || '').toLowerCase() !== 'paid' && <button type="button" className="secondary" onClick={() => openVoucherPosting(v)}>Post</button>}</div></td></tr>)}
              {!selectedVouchers.length && <tr><td colSpan="7">No vouchers generated for this student.</td></tr>}
            </tbody></table></div><Pagination {...studentVoucherPager} />
            <div className="fee-subsection-heading"><h4>Payment History</h4></div>
            <div className="fee-table-wrap"><table><thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th>Challan / Slip</th><th>Amount</th></tr></thead><tbody>
              {paymentPager.rows.map(p => <tr key={p._id}><td>{isoDate(p.paymentDate || p.createdAt)}</td><td>{p.receiptNo || '—'}</td><td>{p.paymentMethod || '—'}</td><td>{p.challanNo || p.slipNo || '—'}</td><td>{money(p.amount)}</td></tr>)}
              {!selectedStudentSummary?.payments?.length && <tr><td colSpan="5">No payments posted for this student.</td></tr>}
            </tbody></table></div><Pagination {...paymentPager} />
          </div>}
        </>}
      </>}

      {tab === 'generate-vouchers' && <>
        <div className="fee-section-title-row"><div><h2>Vouchers &amp; Postings</h2><p className="muted">Generate vouchers, search existing vouchers, print them, and post received payments.</p></div><button type="button" onClick={() => setShowBulkVoucher(true)}>+ Generate Vouchers</button></div>
        <div className="fee-section-title-row fee-voucher-register-title"><h3>Generated Vouchers</h3><label className="fee-voucher-search"><input value={voucherSearch} onChange={e => setVoucherSearch(e.target.value)} placeholder="Search vouchers..." aria-label="Search generated vouchers" /></label></div>
        <div className="fee-table-wrap"><table><thead><tr><th>Voucher No</th><th>Type</th><th>Student</th><th>Program</th><th>Due Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {voucherPager.rows.map(v => <tr key={v._id}><td><strong>{v.voucherNo}</strong></td><td><span className="fee-type-pill">{v.voucherType === 'cash' ? 'Cash' : 'Bank'}</span></td><td>{v.admissionApplicationId?.studentName}<small>{v.admissionApplicationId?.rollNo || v.admissionApplicationId?.formNo || ''}</small></td><td>{v.admissionApplicationId?.programId?.name || '—'}</td><td>{isoDate(v.dueDate) || '—'}</td><td>{money(v.voucherAmount)}</td><td><span className={`fee-voucher-status ${v.status}`}>{v.status}</span></td><td><div className="row-actions"><button type="button" onClick={() => printVoucher(v._id)}>Print</button>{String(v.status || '').toLowerCase() !== 'paid' && <button type="button" className="secondary" onClick={() => openVoucherPosting(v)}>Post</button>}</div></td></tr>)}
          {!filteredGeneratedVouchers.length && <tr><td colSpan="8">{voucherSearch ? 'No vouchers match your search.' : 'No vouchers generated yet.'}</td></tr>}
        </tbody></table></div><Pagination {...voucherPager} />
      </>}

      {tab === 'reports' && <div className="fee-reports-workspace cms-report-workspace">
        <div className="fee-section-title-row cms-report-head"><div><h2>Fee Reports</h2><p className="muted">Create, review and print operational fee reports.</p></div>{reportResult?.rows && <button type="button" onClick={printReport}>Print Report</button>}</div>
        <div className="fee-report-controls cms-report-filterbar">
          <label><span>Report *</span><select value={reportType} onChange={e=>{setReportType(e.target.value);setReportResult(null);}}><option value="defaulters">Defaulters</option><option value="collections">Fee Collection</option><option value="outstanding-dues">Outstanding Dues</option><option value="voucher-status">Voucher Status</option><option value="fee-head-collection">Fee Head Collection</option></select></label>
          <label><span>Session</span><select value={reportFilters.academicSessionId} onChange={e=>setReportFilters({...reportFilters,academicSessionId:e.target.value})}><option value="">All Sessions</option>{sessions.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
          <label><span>Program / Class</span><select value={reportFilters.programId} onChange={e=>setReportFilters({...reportFilters,programId:e.target.value})}><option value="">All Programs / Classes</option>{programs.map(x=><option key={x._id} value={x._id}>{x.name}</option>)}</select></label>
          {(reportType==='defaulters'||reportType==='outstanding-dues') && <label><span>Cut-off Date</span><input type="date" value={reportFilters.cutoff} onChange={e=>setReportFilters({...reportFilters,cutoff:e.target.value})}/></label>}
          {['collections','voucher-status','fee-head-collection'].includes(reportType) && <><label><span>From</span><input type="date" value={reportFilters.from} onChange={e=>setReportFilters({...reportFilters,from:e.target.value})}/></label><label><span>To</span><input type="date" value={reportFilters.to} onChange={e=>setReportFilters({...reportFilters,to:e.target.value})}/></label></>}
          {reportType==='voucher-status' && <label><span>Status</span><select value={reportFilters.status} onChange={e=>setReportFilters({...reportFilters,status:e.target.value})}><option value="">All</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option></select></label>}
          {reportType==='fee-head-collection' && <label><span>Fee Head</span><select value={reportFilters.feeHeadCode} onChange={e=>setReportFilters({...reportFilters,feeHeadCode:e.target.value})}><option value="">All Fee Heads</option>{heads.map(h=><option key={h.code} value={h.code}>{h.name}</option>)}</select></label>}
          <button type="button" onClick={generateReport} disabled={busy}>{busy?'Generating...':'Generate / View'}</button>
        </div>
        {reportResult && <div className="fee-report-result cms-report-table-card"><div className="fee-section-title-row"><div><h3>{reportResult.title}</h3><p className="muted">{reportResult.rows?.length||0} record(s){reportResult.cutoff?` • Cut-off ${isoDate(reportResult.cutoff)}`:''}</p></div>{reportResult.total!==undefined && <strong>Total: {money(reportResult.total)}</strong>}</div><div className="fee-table-wrap cms-report-table-wrap"><table><thead><tr>{reportColumns(reportType).map(([,label])=><th key={label}>{label}</th>)}</tr></thead><tbody>{reportPager.rows.map((row,i)=><tr key={i}>{reportColumns(reportType).map(([key])=><td key={key}>{reportCell(key,row[key])}</td>)}</tr>)}{!reportResult.rows?.length && <tr><td colSpan={reportColumns(reportType).length}>No records found for selected filters.</td></tr>}</tbody></table></div><Pagination {...reportPager} /></div>}
      </div>}

      {showStructureModal && (editingStructure ? canEditFeeStructure : structureCreator) && <div className="fee-modal-backdrop"><form className="fee-structure-modal" onSubmit={createStructure}>
        <div className="fee-modal-header"><div><h3>{editingStructure ? `Edit Fee Structure — v${editingStructure.version || 1}` : 'New Fee Structure'}</h3><p>{editingStructure ? 'Changes create a new tracked revision; previously approved values remain in history.' : 'Define the amount and cycle independently for each Fee Head.'}</p></div><button type="button" className="fee-close" onClick={() => { setShowStructureModal(false); setEditingStructure(null); }}>×</button></div>
        <div className="fee-structure-modal-body">
          <div className="fee-grid fee-grid-2"><label><span>Structure Name *</span><input required value={structureForm.name} onChange={e => setStructureForm({ ...structureForm, name: e.target.value })} /></label><label><span>Academic Session *</span><select required value={structureForm.academicSessionId} onChange={e => setStructureForm({ ...structureForm, academicSessionId: e.target.value })}><option value="">Select Session</option>{sessions.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}</select></label></div>
          <div className="fee-section-label">Classes / Programs *</div><div className="fee-checks">{programs.map(program => <label key={program._id}><input type="checkbox" checked={structureForm.programIds.includes(program._id)} onChange={() => toggleProgram(program._id)} /> {program.name}</label>)}</div>
          <div className="fee-section-label">Fee per Head</div>
          <div className="fee-head-pair-grid">{structureHeads.map((head, index) => { const line = structureForm.feeLines.find(x => x.feeHeadCode === head.code); return <div className="fee-head-compact" key={head.code}><span className="fee-head-number">{index + 1}.</span><strong>{head.name}</strong><input aria-label={`${head.name} amount`} type="number" min="0" step="0.01" placeholder="Amount" value={line?.amount ?? ''} onChange={e => setHeadAmount(head.code, e.target.value)} /><select aria-label={`${head.name} fee type`} value={line?.feeType || (line?.feeCycle === 'periodic' ? 'once' : line?.feeCycle) || 'monthly'} onChange={e => setHeadCycle(head.code, e.target.value)}><option value="once">Once</option><option value="annual">Annually</option><option value="semester">Semester</option><option value="monthly">Monthly</option></select></div>; })}</div>
          {semesterCycleInvalid&&<p className="error fee-semester-note">Semester cycle is available only when every selected Class / Program is a University program.</p>}
        </div>
        <div className="fee-modal-actions fee-structure-modal-actions"><strong>Structure Total: {money(structureTotal)}</strong><div><button type="button" className="secondary" onClick={() => { setShowStructureModal(false); setEditingStructure(null); }}>Cancel</button><button disabled={busy || !structureForm.programIds.length || !structureForm.feeLines.length || !annualSchedulesValid || semesterCycleInvalid}>{busy ? 'Saving...' : editingStructure ? 'Save Revision' : 'Create Fee Structure'}</button></div></div>
      </form></div>}

      {packageEditor && <div className="fee-modal-backdrop"><form className="fee-package-modal" onSubmit={saveStudentPackage}>
        <div className="fee-modal-header"><div><h3>Student Fee Package</h3><p>{packageEditor.admission.studentName} • {packageEditor.admission.programId?.name}</p></div><button type="button" className="fee-close" onClick={() => setPackageEditor(null)}>×</button></div>
        <div className="fee-package-body"><div className="fee-auto-structure fee-full"><span>Fee Structure</span><strong>{applicableStructures.find(x => x._id === selectedStructureId)?.name || 'No applicable approved structure'} {selectedStructureId ? `— v${applicableStructures.find(x => x._id === selectedStructureId)?.version || ''}` : ''}</strong><small>Automatically selected from the student's Academic Session and Class / Program.</small></div>
          {!!packageLines.length && <div className="fee-package-lines"><div className="fee-package-head simple"><strong>Fee Head</strong><strong>Fee Type</strong><strong>Standard Fee</strong><strong>Discount</strong><strong>Final Fee</strong></div>{packageLines.filter(line => !['HOSTEL','TRANSPORT'].includes(String(line.feeHeadCode || '').toUpperCase())).map(line => { const discount = Math.min(Number(line.standardAmount || 0), Math.max(0, Number(line.discountAmount || 0))); return <div className="fee-package-row simple" key={line.feeHeadCode}><span>{headName(line.feeHeadCode)}</span><span className="fee-type-pill">{line.feeType === 'once' ? 'Once' : line.feeType === 'annual' ? 'Annually' : line.feeType === 'semester' ? 'Semester' : 'Monthly'}</span><span>{money(line.standardAmount)}</span><input type="number" min="0" max={line.standardAmount} step="10" inputMode="numeric" value={line.discountAmount} onWheel={e => e.currentTarget.blur()} onChange={e => updatePackageDiscount(line.feeHeadCode, e.target.value)} onBlur={e => updatePackageDiscount(line.feeHeadCode, normalizeMoney10(e.target.value, line.standardAmount))} /><strong>{money(Number(line.standardAmount || 0) - discount)}</strong></div>; })}</div>}
          <div className="fee-package-totals"><span>Standard: <strong>{money(packageTotals.standard)}</strong></span><span>Discount: <strong>{money(packageTotals.discount)}</strong></span><span>Final Package: <strong>{money(packageTotals.final)}</strong></span></div>
          {packageLines.find(x => String(x.feeHeadCode).toUpperCase() === 'TUITION' && ['annual','semester'].includes(x.feeType || x.feeCycle)) && <div className="fee-installment-box"><div className="fee-installment-title"><div><strong>{packageLines.find(x=>String(x.feeHeadCode).toUpperCase()==='TUITION')?.feeType==='semester'?'Semester Tuition Installment Plan':'Annual Tuition Installment Plan'}</strong><small>Define 1 to 7 installments for this student's tuition. Dates here are reference dates only; the actual Due Date is selected when the voucher is generated.</small></div><div className="fee-inline-controls"><label><span>Installments</span><select value={packageInstallments.length || 1} onChange={e => setPackageInstallmentCount(e.target.value)}>{[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}</select></label><button type="button" className="secondary" onClick={splitPackageInstallments}>Split Equally</button></div></div><div className="fee-installment-head"><strong>#</strong><strong>Title</strong><strong>Reference Date</strong><strong>Amount</strong></div>{packageInstallments.map((item, index) => <div className="fee-installment-row" key={index}><strong>{index + 1}</strong><input value={item.title} onChange={e => updatePackageInstallment(index, { title: e.target.value })} /><input required type="date" value={isoDate(item.dueDate)} onChange={e => updatePackageInstallment(index, { dueDate: e.target.value })} /><input required type="number" min="0" step="10" inputMode="numeric" value={item.amount} onChange={e => updatePackageInstallment(index, { amount: e.target.value })} onBlur={e => updatePackageInstallment(index, { amount: normalizeMoney10(e.target.value) })} /></div>)}</div>}
          <label className="fee-full"><span>Change / Concession Note</span><input value={changeReason} onChange={e => setChangeReason(e.target.value)} placeholder="Optional overall note" /></label>
        </div><div className="fee-modal-actions"><button type="button" className="secondary" onClick={() => setPackageEditor(null)}>Cancel</button><button disabled={busy || !packageLines.length || !packageInstallmentsValid}>{busy ? 'Saving...' : 'Save Student Package'}</button></div>
      </form></div>}

      {postingEditor && postingSummary && <div className="fee-modal-backdrop"><form className="fee-package-modal" onSubmit={createPosting}>
        <div className="fee-modal-header"><div><h3>Generate Fee Voucher</h3><p>{postingSummary.plan.admissionApplicationId?.studentName} • {postingSummary.plan.admissionApplicationId?.programId?.name}</p></div><button type="button" className="fee-close" onClick={() => setPostingEditor(null)}>×</button></div>
        <div className="fee-package-body">
          <div className="fee-grid fee-grid-3">
            {feeVoucherMode === 'bank_and_cash' ? <label><span>Voucher Type *</span><select value={postingForm.voucherType || defaultVoucherType} onChange={e => setPostingForm({ ...postingForm, voucherType: e.target.value })}><option value="bank">Bank Voucher</option><option value="cash">Cash Voucher</option></select></label> : <label><span>Voucher Type</span><input readOnly value={feeVoucherMode === 'cash_only' ? 'Cash Voucher' : 'Bank Voucher'} /></label>}
            {['annual','semester'].includes(postingSummary.plan.billingCycle) ? <label><span>Installment Selection</span><input value={postingSummary.plan.billingCycle === 'semester' ? 'Next unpaid semester installment' : 'Next unpaid installment'} readOnly /></label> : <label><span>Fee Month *</span><input required type="month" value={postingForm.periodKey} onChange={e => setPostingForm({ ...postingForm, periodKey: e.target.value })} /></label>}
            {postingSummary.plan.billingCycle === 'monthly' && <label><span>Scheduled Fee</span><input type="number" min="0" step="0.01" value={postingForm.scheduledAmount} onChange={e => setPostingForm({ ...postingForm, scheduledAmount: e.target.value })} /></label>}
            <label><span>Due Date *</span><input required type="date" value={postingForm.dueDate} onChange={e => setPostingForm({ ...postingForm, dueDate: e.target.value, periodKey: postingSummary.plan.billingCycle === 'annual' ? `due-${e.target.value}` : postingForm.periodKey })} /></label>
          </div>
          <div className="fee-posting-summary"><span>Eligible Fee Heads <strong>{eligibleVoucherHeads.length}</strong></span><span>Existing Advance <strong>{money(postingSummary.plan.advanceCredit)}</strong></span></div>

          <div className="fee-eligible-box">
            <div className="fee-section-label"><span>Select Fee Heads for this Voucher *</span><small>Voucher Due Date is the actual payable date. The next unpaid Tuition installment and applicable module charges are shown here.</small></div>
            {eligibleHeadsBusy && <p className="muted">Checking eligible Fee Heads...</p>}
            {!eligibleHeadsBusy && !postingForm.dueDate && <p className="muted">Select a Due Date to load eligible Fee Heads.</p>}
            {!eligibleHeadsBusy && postingForm.dueDate && !eligibleVoucherHeads.length && <p className="muted">No eligible unpaid Fee Head is available for this voucher.</p>}
            {!eligibleHeadsBusy && eligibleVoucherHeads.map(row => (
              <label className="fee-eligible-head" key={row.feeHeadCode}>
                <input
                  type="checkbox"
                  checked={(postingForm.selectedFeeHeadCodes || []).includes(row.feeHeadCode)}
                  onChange={() => toggleVoucherHead(row.feeHeadCode)}
                />
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.scheduledAmount > 0 ? `New Due: ${money(row.scheduledAmount)}` : ''}
                    {row.scheduledAmount > 0 && row.arrearsAmount > 0 ? ' • ' : ''}
                    {row.arrearsAmount > 0 ? `Arrears: ${money(row.arrearsAmount)}` : ''}
                  </small>
                </span>
                <b>{money(row.totalEligibleAmount)}</b>
              </label>
            ))}
          </div>

          <div className="fee-section-label fee-additional-title"><span>Additional Charges</span><button type="button" onClick={addAdditionalLine}>+ Add Fee Head</button></div>
          {postingForm.additionalLines.map((line, index) => <div className="fee-additional-row" key={index}><select required value={line.feeHeadCode} onChange={e => updateAdditionalLine(index, { feeHeadCode: e.target.value, description: headName(e.target.value) })}><option value="">Fee Head</option>{manualAdditionalHeads.map(h => <option key={h.code} value={h.code}>{h.name}</option>)}</select><input required type="number" min="0.01" step="0.01" placeholder="Amount" value={line.amount} onChange={e => updateAdditionalLine(index, { amount: e.target.value })} /><input placeholder="Description (optional)" value={line.description} onChange={e => updateAdditionalLine(index, { description: e.target.value })} /><button type="button" className="danger" onClick={() => removeAdditionalLine(index)}>Remove</button></div>)}
          <div className="fee-voucher-preview"><span>Selected New Due <strong>{money(selectedNewChargesTotal)}</strong></span><span>Selected Arrears <strong>{money(selectedArrearsTotal)}</strong></span><span>Additional <strong>{money(additionalTotal)}</strong></span><span>Advance <strong>-{money(postingSummary.plan.advanceCredit)}</strong></span><b>Voucher Due: {money(Math.max(0, postingPreview))}</b></div>
        </div><div className="fee-modal-actions"><button type="button" className="secondary" onClick={() => setPostingEditor(null)}>Cancel</button><button disabled={busy || eligibleHeadsBusy || (!(postingForm.selectedFeeHeadCodes || []).length && !postingForm.additionalLines.some(x => Number(x.amount || 0) > 0))}>{busy ? 'Posting...' : 'Generate Voucher'}</button></div>
      </form></div>}

      {showBulkVoucher && <div className="fee-modal-backdrop"><form className="fee-package-modal" onSubmit={createBulkVouchers}>
        <div className="fee-modal-header"><div><h3>Generate Vouchers</h3><p>Select the session first, then choose programs and fee heads for this voucher batch.</p></div><button type="button" className="fee-close" onClick={() => setShowBulkVoucher(false)}>×</button></div>
        <div className="fee-package-body fee-bulk-voucher-body fee-bulk-voucher-formatted">
          <section className="fee-bulk-section">
            <div className="fee-bulk-section-title"><strong>Voucher Settings</strong><small>Session is required and limits the eligible programs/students.</small></div>
            <div className="fee-grid fee-grid-3 fee-full">
              <label><span>Academic Session *</span><select required value={bulkVoucher.academicSessionId || ''} onChange={e => changeBulkVoucherSession(e.target.value)}><option value="">Select Session</option>{sessions.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
              {feeVoucherMode === 'bank_and_cash' ? <label><span>Voucher Type *</span><select value={bulkVoucher.voucherType || defaultVoucherType} onChange={e => setBulkVoucher({ ...bulkVoucher, voucherType: e.target.value })}><option value="bank">Bank Voucher</option><option value="cash">Cash Voucher</option></select></label> : <label><span>Voucher Type</span><input readOnly value={feeVoucherMode === 'cash_only' ? 'Cash Voucher' : 'Bank Voucher'} /></label>}
              <label><span>Voucher Due Date *</span><input required type="date" value={bulkVoucher.dueDate} onChange={e => setBulkVoucher({ ...bulkVoucher, dueDate: e.target.value })} /></label>
            </div>
          </section>
          <section className="fee-bulk-section">
            <div className="fee-bulk-section-title"><strong>Classes / Programs *</strong><small>{bulkVoucher.academicSessionId ? 'Only programs with a fee structure in the selected session are shown.' : 'Select Academic Session first.'}</small></div>
            <div className="fee-choice-grid">{bulkVoucherPrograms.map(p => <label className="fee-choice-card" key={p._id}><input type="checkbox" checked={bulkVoucher.programIds.includes(p._id)} onChange={() => toggleBulkProgram(p._id)} /><span>{p.name}</span></label>)}{bulkVoucher.academicSessionId && !bulkVoucherPrograms.length && <div className="fee-empty-choice">No programs with a Fee Structure were found for this session.</div>}</div>
          </section>
          <section className="fee-bulk-section">
            <div className="fee-bulk-section-title"><strong>Fee Heads to Include *</strong><small>Eligibility is checked separately for every student.</small></div>
            <div className="fee-choice-grid fee-head-choice-grid">{heads.map(h => <label className="fee-choice-card" key={h.code}><input type="checkbox" checked={(bulkVoucher.selectedFeeHeadCodes || []).includes(h.code)} onChange={() => toggleBulkFeeHead(h.code)} /><span>{h.name}</span></label>)}</div>
          </section>
          <div className="fee-bulk-note">The selected Voucher Due Date is the actual due date. For annual Tuition, the next unpaid installment is used regardless of its package reference date. Hostel and Transport amounts come from active module assignments; existing arrears remain in the central Fees ledger.</div>
        </div>
        <div className="fee-modal-actions"><button type="button" className="secondary" onClick={() => setShowBulkVoucher(false)}>Cancel</button><button disabled={busy || !bulkVoucher.academicSessionId || !bulkVoucher.programIds.length || !bulkVoucher.dueDate || !(bulkVoucher.selectedFeeHeadCodes || []).length}>{busy ? 'Generating...' : 'Generate Vouchers'}</button></div>
      </form></div>}

      {paymentEditor && paymentSummary && <div className="fee-modal-backdrop"><form className="fee-package-modal" onSubmit={savePayment} onWheelCapture={e => {
        const target = e.target;
        if (target?.tagName === 'INPUT' && target.type === 'number' && target === document.activeElement) target.blur();
      }}>
        <div className="fee-modal-header"><div><h3>Receive Fee Payment</h3><p>{paymentSummary.plan.admissionApplicationId?.studentName} — select exactly which Fee Heads are being paid.</p></div><button type="button" className="fee-close" onClick={() => setPaymentEditor(null)}>×</button></div>
        <div className="fee-package-body">
          <div className="fee-payment-head"><strong>Voucher</strong><strong>Fee Head / Detail</strong><strong>Outstanding</strong><strong>Pay Now</strong></div>
          {(paymentSummary.openLines || []).map(line => { const key = `${line.postingId}:${line.lineId}`; return <div className="fee-payment-row" key={key}><span>{line.voucherNo}</span><span>{headName(line.feeHeadCode)}<small>{line.description}</small></span><strong>{money(line.outstandingAmount)}</strong><input type="number" min="0" max={line.outstandingAmount} step="0.01" value={payValues[key] || ''} onChange={e => setPayValues(prev => ({ ...prev, [key]: e.target.value }))} placeholder="0" /></div>; })}
          {!paymentSummary.openLines?.length && <p className="muted">There are no posted arrears. You may still receive an advance amount for a future posting.</p>}
          <div className="fee-grid fee-grid-3 fee-payment-meta"><label><span>Payment Date *</span><input required type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></label>{feeVoucherMode === 'bank_and_cash' ? <label><span>Payment Method</span><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="bank">Bank</option></select></label> : <label><span>Payment Method</span><input readOnly value={feeVoucherMode === 'cash_only' ? 'Cash' : 'Bank'} /></label>}<label><span>Challan No / Slip No *</span><input required value={challanNo} onChange={e => setChallanNo(e.target.value)} placeholder="Enter challan or deposit slip no" /></label><label><span>Advance Amount</span><input type="number" min="0" step="0.01" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} placeholder="0" /></label></div>
          <div className="fee-package-totals"><span>Allocated: <strong>{money(allocationTotal)}</strong></span><span>Advance: <strong>{money(advanceAmount)}</strong></span><span>Receipt Total: <strong>{money(receiptTotal)}</strong></span></div>
        </div><div className="fee-modal-actions"><button type="button" className="secondary" onClick={() => setPaymentEditor(null)}>Cancel</button><button disabled={busy || receiptTotal <= 0 || !challanNo.trim()}>{busy ? 'Saving...' : 'Post Receipt'}</button></div>
      </form></div>}
    </div>
  );
}
