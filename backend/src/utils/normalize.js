function toId(v) { return v == null ? null : String(v); }
function asDateOnly(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function minutesSinceMidnight(d) { const x = new Date(d); return x.getHours() * 60 + x.getMinutes(); }
function cleanIds(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }
module.exports = { toId, asDateOnly, minutesSinceMidnight, cleanIds };
