/**
 * Capa de datos: los servicios solo hablan con estos repositorios, nunca con Sequelize directamente.
 */
const { Reno, Mantenimiento, sequelize } = require('../models');

const renoRepository = {
  listar: (where = {}) => Reno.findAll({ where, order: [['id', 'ASC']] }),
  buscarPorId: (id, opts = {}) => Reno.findByPk(id, opts),
  contarPorEstado: (estado, opts = {}) => Reno.count({ where: { estado }, ...opts }),
  crear: (data) => Reno.create(data),
  actualizar: (reno, data, opts = {}) => reno.update(data, opts),
  eliminar: (reno) => reno.destroy(),
  enTransaccion: (fn) => sequelize.transaction(fn),
};

const mantenimientoRepository = {
  listar: (where = {}) => Mantenimiento.findAll({ where, order: [['id', 'ASC']] }),
  buscarPorId: (id) => Mantenimiento.findByPk(id),
  existe: (where) => Mantenimiento.count({ where }).then((n) => n > 0),
  crear: (data) => Mantenimiento.create(data),
  actualizar: (mant, data) => mant.update(data),
};

module.exports = { renoRepository, mantenimientoRepository };
