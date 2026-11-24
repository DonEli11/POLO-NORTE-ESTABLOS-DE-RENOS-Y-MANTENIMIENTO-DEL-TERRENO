// Controlador delgado: traduce HTTP <-> servicio. Sin reglas de negocio.
const mantService = require('../services/mantenimientoService');

exports.listar = async (req, res) => res.json(await mantService.listar(req.query.zona));

exports.crear = async (req, res) => {
  const resultado = await mantService.crear(req.body);
  if (!resultado.confirmado) {
    // Servicio SOAP caído: 202 Accepted, se confirmará después
    return res.status(202).json({
      mensaje: 'Mantenimiento recibido. El servicio meteorológico no respondió; se confirmará cuando esté disponible.',
      motivo: resultado.motivo,
      intentos: resultado.intentos,
      mantenimiento: resultado.mantenimiento,
    });
  }
  return res.status(201).json({ ...resultado.mantenimiento.toJSON(), ...(resultado.pronostico && { pronostico: resultado.pronostico }) });
};

exports.cambiarEstado = async (req, res) => res.json(await mantService.cambiarEstado(req.params.id, req.body?.estado));
