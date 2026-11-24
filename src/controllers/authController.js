const authService = require('../services/authService');

exports.login = (req, res) => res.json(authService.login(req.body));
