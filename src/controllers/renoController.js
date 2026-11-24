// Controlador delgado: traduce HTTP <-> servicio. Sin reglas de negocio.
const renoService = require('../services/renoService');

exports.listar = async (req, res) => res.json(await renoService.listar(req.query.estado));
exports.obtener = async (req, res) => res.json(await renoService.obtener(req.params.id));
exports.crear = async (req, res) => res.status(201).json(await renoService.crear(req.body));
exports.actualizar = async (req, res) => res.json(await renoService.actualizar(req.params.id, req.body));
exports.eliminar = async (req, res) => {
  await renoService.eliminar(req.params.id);
  res.status(204).end();
};
exports.asignar = async (req, res) => res.json(await renoService.asignar(req.params.id));
exports.resumenVuelo = async (_req, res) => res.json(await renoService.resumenVuelo());
