const AppError = require('../utils/AppError');

const cuerpoError = (req, codigo, mensaje, detalles = []) => ({
  codigo,
  mensaje,
  detalles,
  timestamp: new Date().toISOString(),
  ruta: req.originalUrl,
});

function enviar(res, req, status, codigo, mensaje, detalles) {
  return res.status(status).json(cuerpoError(req, codigo, mensaje, detalles));
}

// Ruta inexistente
function noEncontrado(req, res) {
  return enviar(res, req, 404, 'RUTA_NO_ENCONTRADA', `No existe ${req.method} ${req.originalUrl}`);
}

// Manejador global: TODA respuesta de error sale con el mismo formato
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, _next) {
  if (err instanceof AppError) {
    return enviar(res, req, err.status, err.codigo, err.message, err.detalles);
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return enviar(res, req, 409, 'NOMBRE_DUPLICADO', 'Ya existe un reno con ese nombre',
      err.errors?.map((e) => `${e.path} duplicado`) || []);
  }
  if (err.name === 'SequelizeValidationError') {
    return enviar(res, req, 400, 'VALIDACION', 'Datos inválidos', err.errors?.map((e) => e.message) || []);
  }
  if (err.type === 'entity.parse.failed') {
    return enviar(res, req, 400, 'JSON_INVALIDO', 'El cuerpo de la petición no es un JSON válido');
  }
  console.error(err);
  return enviar(res, req, 500, 'ERROR_INTERNO', 'Error interno del servidor');
}

module.exports = { manejadorErrores, noEncontrado };
