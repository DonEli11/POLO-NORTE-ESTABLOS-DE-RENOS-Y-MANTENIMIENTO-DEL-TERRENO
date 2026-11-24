const { ESTADOS_RENO } = require('../models');
const { renoRepository: repo, mantenimientoRepository } = require('../repositories');
const AppError = require('../utils/AppError');
const { validarReno, validarEnum } = require('../utils/validators');

const MAX_RENOS_VUELO = 9;
const ENERGIA_MINIMA_VUELO = 70;

const noEncontrado = (id) => new AppError(404, 'RENO_NO_ENCONTRADO', `No existe el reno con id ${id}`);

async function listar(estado) {
  if (estado !== undefined) validarEnum(estado, ESTADOS_RENO, 'estado');
  return repo.listar(estado ? { estado } : {});
}

async function obtener(id) {
  const reno = await repo.buscarPorId(id);
  if (!reno) throw noEncontrado(id);
  return reno;
}

async function crear(body) {
  validarReno(body);
  const { nombre, edad, nivelEnergia, estado = 'DISPONIBLE' } = body;
  // ASIGNADO_VUELO solo se alcanza con PATCH /asignacion (reglas 1 y 2)
  if (estado === 'ASIGNADO_VUELO') {
    throw new AppError(409, 'ESTADO_NO_PERMITIDO', 'Un reno no puede registrarse ya asignado al vuelo; usa PATCH /api/renos/{id}/asignacion');
  }
  return repo.crear({ nombre: nombre.trim(), edad, nivelEnergia, estado });
}

async function actualizar(id, body) {
  validarReno(body);
  const reno = await obtener(id);
  const { nombre, edad, nivelEnergia, estado = reno.estado } = body;

  if (estado === 'ASIGNADO_VUELO' && reno.estado !== 'ASIGNADO_VUELO') {
    throw new AppError(409, 'ESTADO_NO_PERMITIDO', 'Para asignar un reno al vuelo usa PATCH /api/renos/{id}/asignacion');
  }
  return repo.actualizar(reno, { nombre: nombre.trim(), edad, nivelEnergia, estado });
}

// Regla 5
async function eliminar(id) {
  const reno = await obtener(id);
  if (reno.estado === 'ASIGNADO_VUELO') {
    throw new AppError(409, 'RENO_ASIGNADO_NO_ELIMINABLE', `No se puede eliminar a ${reno.nombre}: está ASIGNADO_VUELO`);
  }
  await repo.eliminar(reno);
}

// Reglas 1 y 2 (transacción + bloqueo para que dos peticiones simultáneas no superen el cupo)
async function asignar(id) {
  return repo.enTransaccion(async (t) => {
    const reno = await repo.buscarPorId(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!reno) throw noEncontrado(id);

    if (reno.estado !== 'DISPONIBLE') {
      throw new AppError(409, 'RENO_NO_DISPONIBLE', `El reno debe estar DISPONIBLE para asignarse (estado actual: ${reno.estado})`);
    }
    if (reno.nivelEnergia < ENERGIA_MINIMA_VUELO) {
      throw new AppError(409, 'ENERGIA_INSUFICIENTE', `Se requiere nivelEnergia >= ${ENERGIA_MINIMA_VUELO}`, [`nivelEnergia actual: ${reno.nivelEnergia}`]);
    }
    const asignados = await repo.contarPorEstado('ASIGNADO_VUELO', { transaction: t, lock: t.LOCK.UPDATE });
    if (asignados >= MAX_RENOS_VUELO) {
      throw new AppError(409, 'CUPO_VUELO_COMPLETO', `Ya hay ${MAX_RENOS_VUELO} renos asignados al vuelo`);
    }
    return repo.actualizar(reno, { estado: 'ASIGNADO_VUELO' }, { transaction: t });
  });
}

// Extra B: resumen del vuelo
async function resumenVuelo() {
  const renos = await repo.listar({ estado: 'ASIGNADO_VUELO' });
  const energiaPromedio = renos.length
    ? Math.round((renos.reduce((s, r) => s + r.nivelEnergia, 0) / renos.length) * 10) / 10
    : 0;
  const pistaLista = await mantenimientoRepository.existe({ zona: 'PISTA_DESPEGUE', estado: 'COMPLETADO' });
  return {
    renosAsignados: renos.map(({ id, nombre, nivelEnergia }) => ({ id, nombre, nivelEnergia })),
    totalAsignados: renos.length,
    energiaPromedio,
    pistaConMantenimientoCompletado: pistaLista,
    vueloListo: renos.length === MAX_RENOS_VUELO && pistaLista,
  };
}

module.exports = { listar, obtener, crear, actualizar, eliminar, asignar, resumenVuelo, MAX_RENOS_VUELO };
