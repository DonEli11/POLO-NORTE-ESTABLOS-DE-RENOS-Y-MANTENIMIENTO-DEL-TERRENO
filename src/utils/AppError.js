/**
 * Error de dominio/HTTP. El errorHandler global lo convierte al formato estándar:
 * { codigo, mensaje, detalles, timestamp, ruta }
 */
class AppError extends Error {
  constructor(status, codigo, mensaje, detalles = []) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

module.exports = AppError;
