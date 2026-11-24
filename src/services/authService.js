const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

// Usuarios de prueba definidos por variables de entorno (sin secretos en el repo)
function usuarios() {
  return [
    { username: process.env.JEFE_USER, password: process.env.JEFE_PASSWORD, rol: 'JEFE_ESTABLO' },
    { username: process.env.ELFO_USER, password: process.env.ELFO_PASSWORD, rol: 'ELFO' },
  ].filter((u) => u.username && u.password);
}

function login(body) {
  const { username, password } = body || {};
  if (!username || !password) {
    throw new AppError(400, 'VALIDACION', 'username y password son obligatorios');
  }
  const user = usuarios().find((u) => u.username === username && u.password === password);
  if (!user) throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');

  const token = jwt.sign({ sub: user.username, rol: user.rol }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '2h',
  });
  return { token, rol: user.rol };
}

module.exports = { login };
