const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

// 401: no hay token o no es válido
function autenticar(req, _res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return next(new AppError(401, 'TOKEN_REQUERIDO', 'Se requiere un token: Authorization: Bearer <token>'));
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return next(new AppError(401, 'TOKEN_INVALIDO', 'El token es inválido o expiró'));
  }
}

// 403: token válido pero con otro rol (ELFO, etc.)
const requiereRol = (...roles) => [
  autenticar,
  (req, _res, next) => (roles.includes(req.user.rol)
    ? next()
    : next(new AppError(403, 'ROL_INSUFICIENTE', `Esta operación requiere el rol ${roles.join(' o ')}`, [`rol actual: ${req.user.rol}`]))),
];

module.exports = { autenticar, requiereRol };
