const r = require('express').Router();
const c = require('./controller');
const permit = require('../../middleware/permissions');
const P = require('../../constants/permissions');

r.get('/permissions', permit(P.MANAGE_ROLES), c.permissionCatalog);
r.get('/', permit(P.MANAGE_USERS), c.list);
r.post('/', permit(P.MANAGE_ROLES), c.create);
r.put('/assign/:userId', permit(P.MANAGE_USER_ROLES), c.assign);
r.put('/:id', permit(P.MANAGE_ROLES), c.update);

module.exports = r;
