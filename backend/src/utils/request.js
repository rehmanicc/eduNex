function collegeIdFromRequest(req) {
  return req.collegeId || req.user?.collegeId;
}

function sendError(res, message, status = 400) {
  return res.status(status).json({ error: message });
}

module.exports = { collegeIdFromRequest, sendError };
