// Performance Patch 6
// Loaded only when voucher printing is requested.

const money = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

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
  let x = n;
  const parts = [];
  for (const [size, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]) {
    if (x >= size) {
      const q = Math.floor(x / size);
      parts.push(`${under1000(q)} ${label}`);
      x %= size;
    }
  }
  if (x > 0) parts.push(under1000(x));
  return `${parts.join(' ')} Rupees Only`;
};

const esc = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[ch]));

const voucherDate = value => value ? new Date(value).toLocaleDateString() : '—';

function voucherParts(data, fallbackHeads = []) {
  const { posting, college } = data;
  const admission = posting.admissionApplicationId || {};
  const program = admission.programId || {};
  const session = admission.academicSessionId || {};
  const headMap = new Map((data.systemHeads || fallbackHeads).map(h => [String(h.code).toUpperCase(), h.name]));
  const isPartial = String(posting.status || '').toLowerCase() === 'partial';
  const outstandingAmount = Number(data.outstandingAmount ?? posting.voucherAmount ?? 0);
  const newLines = isPartial
    ? [{ title: 'Remaining Balance', detail: `Original voucher amount: ${money(posting.voucherAmount)}`, amount: outstandingAmount }]
    : (posting.lines || []).map(line => ({
        title: headMap.get(String(line.feeHeadCode || '').toUpperCase()) || line.feeHeadCode,
        detail: line.description || '', amount: Number(line.amount || 0)
      }));
  const arrears = isPartial ? 0 : Number((posting.arrearsSnapshot || []).reduce((sum, line) => sum + Number(line.outstandingAmount || 0), 0).toFixed(2));
  const detailedArrears = isPartial ? [] : (posting.arrearsSnapshot || []).map(line => ({
    title: `${headMap.get(String(line.feeHeadCode || '').toUpperCase()) || line.feeHeadCode} Arrear`,
    detail: line.description || '', amount: Number(line.outstandingAmount || 0)
  }));
  const advanceApplied = isPartial ? 0 : Number(posting.advanceApplied || 0);
  const payableAmount = isPartial ? outstandingAmount : Number(posting.voucherAmount || 0);
  const collegeName = college?.displayName || college?.name || college?.shortName || 'College / School';
  const collegeContact = [college?.address, college?.phone || college?.phoneNumber, college?.email].filter(Boolean).join(' • ');
  const rawCollegeLogo = college?.logoUrl || college?.logo || '';
  const collegeLogo = rawCollegeLogo ? (() => { try { return new URL(rawCollegeLogo, window.location.origin).href; } catch (_) { return rawCollegeLogo; } })() : '';
  return { posting, admission, program, session, newLines, arrears, detailedArrears, advanceApplied, payableAmount, isPartial, collegeName, collegeContact, collegeLogo };
}

function voucherHeaderHtml(parts, copyLabel, voucherTitle = 'FEE VOUCHER') {
  const { posting, collegeName, collegeContact, collegeLogo } = parts;
  return `<header class="voucher-header">
    ${collegeLogo ? `<img class="voucher-logo" src="${esc(collegeLogo)}" alt="Logo">` : '<div></div>'}
    <div class="voucher-brand"><h1>${esc(collegeName)}</h1><p>${esc(collegeContact)}</p></div>
    <div class="voucher-title"><strong>${esc(copyLabel)}</strong><span>${esc(voucherTitle)}</span><small>No: ${esc(posting.voucherNo)}</small></div>
  </header>`;
}

function voucherRowsHtml(parts) {
  const { newLines, detailedArrears, advanceApplied } = parts;
  const lines = [...detailedArrears, ...newLines];
  let rows = lines.map((line, i) => `<tr><td>${i + 1}</td><td><b>${esc(line.title)}</b>${line.detail ? `<small>${esc(line.detail)}</small>` : ''}</td><td class="amt">${money(line.amount)}</td></tr>`).join('');
  if (advanceApplied > 0) rows += `<tr><td></td><td><b>Advance Credit Applied</b></td><td class="amt">-${money(advanceApplied)}</td></tr>`;
  return rows || '<tr><td colspan="3">No fee lines</td></tr>';
}

function voucherIdentityHtml(parts) {
  const { posting, admission, program, session } = parts;
  return `<div class="voucher-identity">
    <span><b>Student Name</b>${esc(admission.studentName || '')}</span>
    <span><b>Father / Guardian</b>${esc(admission.fatherName || '')}</span>
    <span><b>Roll / Form No</b>${esc(admission.rollNo || admission.formNo || '')}</span>
    <span><b>Program / Class</b>${esc(program.name || '')}</span>
    <span><b>Session</b>${esc(session.name || '')}</span>
    <span><b>Issue Date</b>${voucherDate(posting.postingDate || posting.createdAt)}</span>
    <span><b>Due Date</b>${voucherDate(posting.dueDate)}</span>
    <span><b>Payment Method</b>${String(posting.voucherType || 'bank') === 'cash' ? 'Cash' : 'Bank'}</span>
  </div>`;
}

function voucherTableHtml(parts) {
  return `<table class="voucher-table"><thead><tr><th>No.</th><th>Description</th><th>Amount (PKR)</th></tr></thead><tbody>${voucherRowsHtml(parts)}</tbody><tfoot><tr><td></td><td>Total Payable (PKR)</td><td class="amt">${money(parts.payableAmount)}</td></tr></tfoot></table>`;
}

function bankVoucherCopyHtml(data, copyLabel, note = '', fallbackHeads = []) {
  const parts = voucherParts(data, fallbackHeads);
  const officeBox = copyLabel === 'COLLEGE COPY'
    ? '<div class="voucher-office-box"><b>For College Use</b><span>Received: __________________</span><span>Signature: __________________</span></div>'
    : copyLabel === 'BANK COPY'
      ? '<div class="voucher-office-box"><b>Bank / Collection Use</b><span>Stamp: _____________________</span><span>Signature: __________________</span></div>'
      : '<div class="voucher-office-box"><b>Student Record</b><span>Keep this copy as payment reference.</span></div>';
  return `<section class="bank-voucher-copy ${copyLabel.toLowerCase().replace(/ /g, '-')}">
    ${voucherHeaderHtml(parts, copyLabel)}
    ${voucherIdentityHtml(parts)}
    <div class="voucher-main-grid"><div>${voucherTableHtml(parts)}<div class="voucher-words"><b>Amount in Words:</b> ${esc(amountInWords(parts.payableAmount))}</div></div>${officeBox}</div>
    ${note ? `<div class="voucher-note"><b>Note:</b> ${esc(note)}</div>` : ''}
    <div class="voucher-footer"><span>Generated by eduNex</span><span>Voucher: ${esc(parts.posting.voucherNo)}</span></div>
  </section>`;
}

function bankVoucherSheetHtml(data, note = '', fallbackHeads = []) {
  return `<div class="bank-sheet">
    ${bankVoucherCopyHtml(data, 'BANK COPY', note, fallbackHeads)}
    <div class="voucher-cut">✂</div>
    ${bankVoucherCopyHtml(data, 'COLLEGE COPY', note, fallbackHeads)}
    <div class="voucher-cut">✂</div>
    ${bankVoucherCopyHtml(data, 'STUDENT COPY', note, fallbackHeads)}
  </div>`;
}

function cashVoucherHtml(data, note = '', fallbackHeads = []) {
  const parts = voucherParts(data, fallbackHeads);
  return `<section class="cash-voucher">
    ${voucherHeaderHtml(parts, 'FEE VOUCHER')}
    ${voucherIdentityHtml(parts)}
    ${voucherTableHtml(parts)}
    <div class="voucher-words"><b>Amount in Words:</b> ${esc(amountInWords(parts.payableAmount))}</div>
    ${note ? `<div class="voucher-note"><b>Note:</b> ${esc(note)}</div>` : ''}
    <div class="cash-signatures"><span>Received By / Stamp</span><span>Authorized Signature</span></div>
    <div class="voucher-footer"><span>Generated by eduNex</span><span>Voucher: ${esc(parts.posting.voucherNo)}</span></div>
  </section>`;
}

export function voucherPrintDocument(details, title = 'Fee Voucher', options = {}, fallbackHeads = []) {
  const vouchers = Array.isArray(details) ? details : [details];
  const note = String(options.note || '').trim();
  const cashPerPage = Math.min(3, Math.max(1, Number(options.cashPerPage || 1)));
  let body = '';
  let cashBuffer = [];
  const flushCash = () => {
    if (!cashBuffer.length) return;
    body += `<div class="cash-sheet cash-${cashPerPage}">${cashBuffer.map(v => cashVoucherHtml(v, note, fallbackHeads)).join('')}</div>`;
    cashBuffer = [];
  };
  vouchers.forEach(v => {
    if (String(v.posting?.voucherType || 'bank') === 'cash') {
      cashBuffer.push(v);
      if (cashBuffer.length === cashPerPage) flushCash();
    } else {
      flushCash();
      body += bankVoucherSheetHtml(v, note, fallbackHeads);
    }
  });
  flushCash();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4 portrait;margin:7mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif;color:#0f172a;background:#fff}.amt{text-align:right;white-space:nowrap}
    .voucher-header{display:grid;grid-template-columns:16mm 1fr 37mm;gap:3mm;align-items:center;border-bottom:1.5px solid #164e7a;padding-bottom:2mm}.voucher-logo{width:14mm;height:14mm;object-fit:contain}.voucher-brand h1{font-size:14px;color:#123f6d;margin:0 0 1mm}.voucher-brand p{font-size:6.8px;margin:0;color:#475569}.voucher-title{text-align:center;background:#eaf2f9;border-radius:2mm;padding:1.5mm 1mm}.voucher-title strong{display:block;font-size:9px}.voucher-title span{display:block;font-size:8px;font-weight:800;margin-top:.5mm}.voucher-title small{display:block;font-size:6.5px;margin-top:.5mm}
    .voucher-identity{display:grid;grid-template-columns:repeat(4,1fr);gap:1.4mm 3mm;background:#f3f7fb;padding:2mm;margin-top:2mm;border-radius:1mm}.voucher-identity span{font-size:7px;min-width:0}.voucher-identity b{display:block;font-size:6px;color:#475569;margin-bottom:.4mm}.voucher-table{width:100%;border-collapse:collapse;margin-top:2mm;font-size:7px}.voucher-table th,.voucher-table td{border:1px solid #94a3b8;padding:1.2mm}.voucher-table th{background:#e5eff8}.voucher-table th:first-child,.voucher-table td:first-child{width:8mm;text-align:center}.voucher-table th:last-child,.voucher-table td:last-child{width:28mm}.voucher-table td small{display:block;font-size:5.8px;color:#64748b}.voucher-table tfoot td{font-weight:800;background:#edf4fa}.voucher-words{font-size:6.5px;margin-top:1.5mm}.voucher-note{font-size:6.5px;margin-top:1.4mm;padding:1.2mm 1.6mm;background:#f8fafc;border-left:2px solid #164e7a;white-space:pre-wrap}.voucher-footer{display:flex;justify-content:space-between;font-size:5.8px;color:#64748b;margin-top:1.5mm}
    .bank-sheet{height:283mm;display:grid;grid-template-rows:1fr 4mm 1fr 4mm 1fr;page-break-after:always}.bank-sheet:last-child{page-break-after:auto}.bank-voucher-copy{border:1px solid #94a3b8;border-radius:1.5mm;padding:2.5mm 3mm;overflow:hidden}.bank-voucher-copy.bank-copy .voucher-title{background:#fee2e2}.bank-voucher-copy.college-copy .voucher-title{background:#dcfce7}.bank-voucher-copy.student-copy .voucher-title{background:#dbeafe}.voucher-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 38mm;gap:2.5mm}.voucher-office-box{margin-top:2mm;border:1px solid #cbd5e1;padding:2mm;font-size:6.2px;display:flex;flex-direction:column;gap:2.5mm}.voucher-office-box b{font-size:6.8px}.voucher-cut{height:4mm;border-top:1px dashed #64748b;font-size:7px;line-height:3mm;color:#475569}
    .cash-sheet{height:283mm;display:grid;page-break-after:always}.cash-sheet:last-child{page-break-after:auto}.cash-sheet.cash-1{grid-template-rows:1fr}.cash-sheet.cash-2{grid-template-rows:repeat(2,1fr);gap:4mm}.cash-sheet.cash-3{grid-template-rows:repeat(3,1fr);gap:3mm}.cash-voucher{border:1.2px solid #64748b;border-radius:2mm;padding:4mm;position:relative;overflow:hidden}.cash-sheet.cash-1 .cash-voucher{padding:7mm}.cash-sheet.cash-1 .voucher-header{grid-template-columns:22mm 1fr 45mm;padding-bottom:4mm}.cash-sheet.cash-1 .voucher-logo{width:20mm;height:20mm}.cash-sheet.cash-1 .voucher-brand h1{font-size:20px}.cash-sheet.cash-1 .voucher-brand p{font-size:9px}.cash-sheet.cash-1 .voucher-title strong{font-size:12px}.cash-sheet.cash-1 .voucher-title span{font-size:11px}.cash-sheet.cash-1 .voucher-identity{font-size:10px;padding:4mm;margin-top:4mm}.cash-sheet.cash-1 .voucher-identity span{font-size:10px}.cash-sheet.cash-1 .voucher-identity b{font-size:8px}.cash-sheet.cash-1 .voucher-table{font-size:10px;margin-top:4mm}.cash-sheet.cash-1 .voucher-table th,.cash-sheet.cash-1 .voucher-table td{padding:2.5mm}.cash-sheet.cash-1 .voucher-words,.cash-sheet.cash-1 .voucher-note{font-size:9px;margin-top:3mm}.cash-signatures{display:grid;grid-template-columns:1fr 1fr;gap:25mm;text-align:center;font-size:6.5px;margin-top:3mm}.cash-signatures span{border-top:1px solid #64748b;padding-top:1.5mm}.cash-sheet.cash-1 .cash-signatures{font-size:9px;margin-top:12mm}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>${body}</body></html>`;
}
