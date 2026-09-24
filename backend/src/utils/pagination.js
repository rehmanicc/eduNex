const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function positiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getPagination(query = {}, options = {}) {
  const defaultLimit = positiveInt(options.defaultLimit, DEFAULT_LIMIT);
  const maxLimit = positiveInt(options.maxLimit, MAX_LIMIT);
  const requested = query.page !== undefined || query.limit !== undefined || String(query.paginated || '') === '1';
  const page = positiveInt(query.page, 1);
  const limit = Math.min(positiveInt(query.limit, defaultLimit), maxLimit);
  return { requested, page, limit, skip: (page - 1) * limit };
}

function setPaginationHeaders(res, { page, limit, total }) {
  const pages = Math.max(1, Math.ceil(Number(total || 0) / limit));
  res.set('X-Page', String(page));
  res.set('X-Page-Size', String(limit));
  res.set('X-Total-Count', String(total || 0));
  res.set('X-Total-Pages', String(pages));
  // Allows browser clients to read these headers when CORS is enabled.
  res.set('Access-Control-Expose-Headers', 'X-Page, X-Page-Size, X-Total-Count, X-Total-Pages');
}

async function executePaged({ model, filter, buildQuery, req, res, defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT }) {
  const paging = getPagination(req.query, { defaultLimit, maxLimit });
  let query = buildQuery(model.find(filter));

  // Backward compatible: existing web/mobile clients still receive their complete legacy array.
  // Pagination is activated only when page/limit/paginated is explicitly supplied.
  if (!paging.requested) return query;

  const [rows, total] = await Promise.all([
    query.skip(paging.skip).limit(paging.limit),
    model.countDocuments(filter)
  ]);
  setPaginationHeaders(res, { ...paging, total });
  return rows;
}

module.exports = { getPagination, setPaginationHeaders, executePaged, DEFAULT_LIMIT, MAX_LIMIT };
