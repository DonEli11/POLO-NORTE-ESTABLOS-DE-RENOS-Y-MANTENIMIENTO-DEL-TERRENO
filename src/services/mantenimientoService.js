const { ZONAS, ESTADOS_MANT } = require('../models');
const { mantenimientoRepository: repo } = require('../repositories');
const AppError = require('../utils/AppError');
const { validarMantenimiento, validarEnum } = require('../utils/validators');
const { meteoAdapter, ServicioExternoNoDisponibleError } = require('../adapters/MeteoAdapter');

const ZONAS_EXTERIORES = ['PISTA_DESPEGUE'];

// Regla 3: transiciones permitidas (cualquier otra -> 409)
const TRANSICIONES = {
  PROGRAMADO: ['EN_CURSO', 'CANCELADO'],
  EN_CURSO: ['COMPLETADO'],
};

async function listar(zona) {
  if (zona !== undefined) validarEnum(zona, ZONAS, 'zona');
  return repo.listar(zona ? { zona } : {});
}

/**
 * Regla 4 + manejo de fallo distribuido.
 * Devuelve { mantenimiento, confirmado, pronostico?, motivo? }
 *  - confirmado = true  -> PROGRAMADO (201)
 *  - confirmado = false -> PENDIENTE_CLIMA (202): el SOAP falló, se confirmará después
 */
async function crear(body) {
  validarMantenimiento(body);
  const { zona, tipo, fechaProgramada, responsable } = body;
  const datos = { zona, tipo, fechaProgramada, responsable: responsable.trim() };

  if (!ZONAS_EXTERIORES.includes(zona)) {
    return { mantenimiento: await repo.crear({ ...datos, estado: 'PROGRAMADO' }), confirmado: true };
  }

  let pronostico;
  try {
    pronostico = await meteoAdapter.obtenerPronostico(zona, fechaProgramada);
  } catch (err) {
    if (!(err instanceof ServicioExternoNoDisponibleError)) throw err;
    // Fault o timeout: se guarda igual, pendiente de confirmar el clima. Nunca 500.
    const mantenimiento = await repo.crear({ ...datos, estado: 'PENDIENTE_CLIMA' });
    return { mantenimiento, confirmado: false, motivo: err.motivo, intentos: err.intentos };
  }

  if (pronostico.condicion === 'VENTISCA') {
    throw new AppError(422, 'PRONOSTICO_VENTISCA',
      `No se puede programar un mantenimiento en ${zona} el ${fechaProgramada}: el pronóstico es VENTISCA`);
  }
  const mantenimiento = await repo.crear({ ...datos, estado: 'PROGRAMADO' });
  return { mantenimiento, confirmado: true, pronostico: pronostico.condicion };
}

async function cambiarEstado(id, nuevoEstado) {
  validarEnum(nuevoEstado, ESTADOS_MANT, 'estado');
  const mant = await repo.buscarPorId(id);
  if (!mant) throw new AppError(404, 'MANTENIMIENTO_NO_ENCONTRADO', `No existe el mantenimiento con id ${id}`);

  const permitidos = TRANSICIONES[mant.estado] || [];
  if (!permitidos.includes(nuevoEstado)) {
    throw new AppError(409, 'TRANSICION_INVALIDA', `No se puede pasar de ${mant.estado} a ${nuevoEstado}`,
      permitidos.length ? [`desde ${mant.estado} solo se permite: ${permitidos.join(', ')}`] : [`${mant.estado} no admite transiciones`]);
  }
  return repo.actualizar(mant, { estado: nuevoEstado });
}

module.exports = { listar, crear, cambiarEstado, TRANSICIONES };
