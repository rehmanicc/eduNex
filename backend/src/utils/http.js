function ok(res, data, status = 200) { return res.status(status).json(data); }
function fail(res, status, error, details) { return res.status(status).json({ error, ...(details ? { details } : {}) }); }
module.exports = { ok, fail };
