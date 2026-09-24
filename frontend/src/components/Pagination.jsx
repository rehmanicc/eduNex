import { useEffect, useMemo, useState } from 'react';
import './pagination.css';

export const PAGE_SIZE = 25;

export function usePagination(items = [], resetKey = '') {
  const [page, setPage] = useState(1);
  const total = Array.isArray(items) ? items.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const rows = useMemo(() => (Array.isArray(items) ? items : []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [items, page]);
  return { page, setPage, total, totalPages, rows };
}

export default function Pagination({ page, setPage, total, totalPages }) {
  if (!total) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const pages = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  for (let p = Math.max(1, to - 4); p <= to; p += 1) pages.push(p);
  return <div className="cms-pagination">
    <span>Showing {start}–{end} of {total}</span>
    <div className="cms-pagination-buttons">
      <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
      {pages.map(p => <button type="button" key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>)}
      <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
    </div>
  </div>;
}
