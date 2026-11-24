process.env.NODE_ENV = 'test';
process.env.JEFE_USER = 'jefe'; process.env.JEFE_PASSWORD = 'jefe123';
process.env.ELFO_USER = 'elfo'; process.env.ELFO_PASSWORD = 'elfo123';
process.env.JWT_SECRET = 'secreto-de-test';
const request = require('supertest');
const app = require('../src/app');
const { sequelize, ensureDatabase } = require('../src/config/db');
const { Reno } = require('../src/models');
const { meteoAdapter, ServicioExternoNoDisponibleError } = require('../src/adapters/MeteoAdapter');

jest.mock('../src/adapters/MeteoAdapter', () => {
  const real = jest.requireActual('../src/adapters/MeteoAdapter');
  return { ...real, meteoAdapter: { obtenerPronostico: jest.fn() } };
});
const pron = (condicion) => ({ zona: 'PISTA_DESPEGUE', fecha: '2030-12-20', condicion });
const expectFormatoError = (res, status, codigo) => {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({
    codigo, mensaje: expect.any(String), detalles: expect.any(Array),
    timestamp: expect.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/), ruta: expect.any(String),
  });
};

const FUTURA = '2030-12-20';
let tokenJefe;
let tokenElfo;

beforeAll(async () => {
  await ensureDatabase();
  await sequelize.sync({ force: true });
  tokenJefe = (await request(app).post('/api/auth/login').send({ username: 'jefe', password: 'jefe123' })).body.token;
  tokenElfo = (await request(app).post('/api/auth/login').send({ username: 'elfo', password: 'elfo123' })).body.token;
});

beforeEach(async () => {
  await sequelize.truncate({ cascade: true });
  meteoAdapter.obtenerPronostico.mockReset();
});

afterAll(() => sequelize.close());

const nuevoReno = (data = {}) => request(app)
  .post('/api/renos')
  .set('Authorization', `Bearer ${tokenJefe}`)
  .send({ nombre: 'Rodolfo', edad: 5, nivelEnergia: 90, ...data });

describe('Seguridad', () => {
  test('POST /renos sin token -> 401', async () => {
    const res = await request(app).post('/api/renos').send({ nombre: 'X', edad: 1, nivelEnergia: 1 });
    expectFormatoError(res, 401, 'TOKEN_REQUERIDO');
    expect(res.body.ruta).toBe('/api/renos');
  });
  test('POST /renos con rol ELFO -> 403', async () => {
    const res = await request(app).post('/api/renos').set('Authorization', `Bearer ${tokenElfo}`)
      .send({ nombre: 'X', edad: 1, nivelEnergia: 1 });
    expectFormatoError(res, 403, 'ROL_INSUFICIENTE');
  });
  test('login inválido -> 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'jefe', password: 'mal' });
    expect(res.status).toBe(401);
  });
  test('GET /renos es público', async () => {
    expect((await request(app).get('/api/renos')).status).toBe(200);
  });
});

describe('Renos', () => {
  test('crea reno -> 201 con estado DISPONIBLE', async () => {
    const res = await nuevoReno();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nombre: 'Rodolfo', estado: 'DISPONIBLE' });
  });
  test('nombre duplicado -> 409', async () => {
    await nuevoReno();
    expectFormatoError(await nuevoReno(), 409, 'NOMBRE_DUPLICADO');
  });
  test.each([
    [{ edad: 0 }], [{ edad: 26 }], [{ nivelEnergia: -1 }], [{ nivelEnergia: 101 }], [{ nombre: '' }], [{ estado: 'VOLANDO' }],
  ])('validación %j -> 400', async (data) => {
    expectFormatoError(await nuevoReno(data), 400, 'VALIDACION');
  });
  test('filtra por estado', async () => {
    await nuevoReno({ nombre: 'A' });
    await nuevoReno({ nombre: 'B', estado: 'EN_DESCANSO' });
    const res = await request(app).get('/api/renos?estado=EN_DESCANSO');
    expect(res.body.map((r) => r.nombre)).toEqual(['B']);
  });
  test('detalle inexistente -> 404', async () => {
    expectFormatoError(await request(app).get('/api/renos/9999'), 404, 'RENO_NO_ENCONTRADO');
  });
  test('PUT actualiza', async () => {
    const { body } = await nuevoReno();
    const res = await request(app).put(`/api/renos/${body.id}`).set('Authorization', `Bearer ${tokenJefe}`)
      .send({ nombre: 'Rodolfo', edad: 6, nivelEnergia: 50, estado: 'EN_REVISION' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ edad: 6, estado: 'EN_REVISION' });
  });
});

describe('Asignación al vuelo (reglas 1 y 2)', () => {
  const asignar = (id) => request(app).patch(`/api/renos/${id}/asignacion`).set('Authorization', `Bearer ${tokenJefe}`);

  test('reno DISPONIBLE con energía >= 70 -> 200', async () => {
    const { body } = await nuevoReno({ nivelEnergia: 70 });
    const res = await asignar(body.id);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ASIGNADO_VUELO');
  });
  test('energía < 70 -> 409', async () => {
    const { body } = await nuevoReno({ nivelEnergia: 69 });
    expect((await asignar(body.id)).status).toBe(409);
  });
  test('estado distinto de DISPONIBLE -> 409', async () => {
    const { body } = await nuevoReno({ estado: 'EN_DESCANSO' });
    expect((await asignar(body.id)).status).toBe(409);
  });
  test('el décimo reno -> 409', async () => {
    await Reno.bulkCreate(Array.from({ length: 9 }, (_, i) => ({
      nombre: `Reno${i}`, edad: 5, nivelEnergia: 90, estado: 'ASIGNADO_VUELO',
    })));
    const { body } = await nuevoReno({ nombre: 'Decimo' });
    const res = await asignar(body.id);
    expectFormatoError(res, 409, 'CUPO_VUELO_COMPLETO');
  });
  test('PUT no puede saltarse la regla poniendo ASIGNADO_VUELO -> 409', async () => {
    const { body } = await nuevoReno({ nivelEnergia: 10 });
    const res = await request(app).put(`/api/renos/${body.id}`).set('Authorization', `Bearer ${tokenJefe}`)
      .send({ nombre: 'Rodolfo', edad: 5, nivelEnergia: 10, estado: 'ASIGNADO_VUELO' });
    expect(res.status).toBe(409);
  });
});

describe('Eliminar (regla 5)', () => {
  const del = (id) => request(app).delete(`/api/renos/${id}`).set('Authorization', `Bearer ${tokenJefe}`);

  test('elimina reno disponible -> 204', async () => {
    const { body } = await nuevoReno();
    expect((await del(body.id)).status).toBe(204);
  });
  test('reno ASIGNADO_VUELO -> 409', async () => {
    const reno = await Reno.create({ nombre: 'Volador', edad: 5, nivelEnergia: 90, estado: 'ASIGNADO_VUELO' });
    expect((await del(reno.id)).status).toBe(409);
  });
});

describe('Mantenimientos (reglas 3 y 4)', () => {
  const crearMant = (data = {}) => request(app).post('/api/mantenimientos')
    .send({ zona: 'ESTABLO', tipo: 'INSPECCION', fechaProgramada: FUTURA, responsable: 'Elfo Pepe', ...data });

  test('zona interior no consulta el clima -> 201 PROGRAMADO', async () => {
    const res = await crearMant();
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('PROGRAMADO');
    expect(meteoAdapter.obtenerPronostico).not.toHaveBeenCalled();
  });
  test('fecha pasada -> 400', async () => {
    expect((await crearMant({ fechaProgramada: '2020-01-01' })).status).toBe(400);
  });
  test('PISTA_DESPEGUE con DESPEJADO -> 201 PROGRAMADO', async () => {
    meteoAdapter.obtenerPronostico.mockResolvedValue(pron('DESPEJADO'));
    const res = await crearMant({ zona: 'PISTA_DESPEGUE' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estado: 'PROGRAMADO', pronostico: 'DESPEJADO' });
    expect(meteoAdapter.obtenerPronostico).toHaveBeenCalledWith('PISTA_DESPEGUE', FUTURA);
  });
  test('PISTA_DESPEGUE con VENTISCA -> 422', async () => {
    meteoAdapter.obtenerPronostico.mockResolvedValue(pron('VENTISCA'));
    expectFormatoError(await crearMant({ zona: 'PISTA_DESPEGUE' }), 422, 'PRONOSTICO_VENTISCA');
  });
  test('SOAP caído -> 202 y se guarda PENDIENTE_CLIMA', async () => {
    meteoAdapter.obtenerPronostico.mockRejectedValue(new ServicioExternoNoDisponibleError('soap:Server: Estación sin señal', 2));
    const res = await crearMant({ zona: 'PISTA_DESPEGUE' });
    expect(res.status).toBe(202);
    expect(res.body.mantenimiento.estado).toBe('PENDIENTE_CLIMA');
    expect(res.body.motivo).toMatch(/Estación sin señal/);
    const { Mantenimiento } = require('../src/models');
    expect((await Mantenimiento.findByPk(res.body.mantenimiento.id)).estado).toBe('PENDIENTE_CLIMA');
  });
  test('error inesperado del adaptador no se disfraza de 202', async () => {
    meteoAdapter.obtenerPronostico.mockRejectedValue(new TypeError('bug'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await crearMant({ zona: 'PISTA_DESPEGUE' })).status).toBe(500);
    console.error.mockRestore();
  });
  test('filtra por zona', async () => {
    await crearMant();
    await crearMant({ zona: 'BODEGA_REGALOS' });
    const res = await request(app).get('/api/mantenimientos?zona=BODEGA_REGALOS');
    expect(res.body).toHaveLength(1);
  });

  const cambiar = (id, estado) => request(app).patch(`/api/mantenimientos/${id}/estado`).send({ estado });

  test('PROGRAMADO -> EN_CURSO -> COMPLETADO', async () => {
    const { body } = await crearMant();
    expect((await cambiar(body.id, 'EN_CURSO')).status).toBe(200);
    expect((await cambiar(body.id, 'COMPLETADO')).body.estado).toBe('COMPLETADO');
  });
  test('PROGRAMADO -> CANCELADO', async () => {
    const { body } = await crearMant();
    expect((await cambiar(body.id, 'CANCELADO')).status).toBe(200);
  });
  test.each([
    ['PROGRAMADO', 'COMPLETADO'], ['EN_CURSO', 'CANCELADO'], ['COMPLETADO', 'EN_CURSO'], ['CANCELADO', 'PROGRAMADO'],
  ])('transición inválida %s -> %s = 409', async (desde, hacia) => {
    const { body } = await crearMant();
    const { Mantenimiento } = require('../src/models');
    await Mantenimiento.update({ estado: desde }, { where: { id: body.id } });
    expectFormatoError(await cambiar(body.id, hacia), 409, 'TRANSICION_INVALIDA');
  });
});

describe('Formato de errores y extras', () => {
  test('ruta inexistente -> 404 con formato estándar', async () => {
    expectFormatoError(await request(app).get('/api/nada'), 404, 'RUTA_NO_ENCONTRADA');
  });
  test('JSON mal formado -> 400', async () => {
    const res = await request(app).post('/api/mantenimientos').set('Content-Type', 'application/json').send('{malo');
    expectFormatoError(res, 400, 'JSON_INVALIDO');
  });
  test('id no numérico -> 400', async () => {
    expectFormatoError(await request(app).get('/api/renos/abc'), 400, 'ID_INVALIDO');
  });
  test('token inválido -> 401', async () => {
    const res = await request(app).delete('/api/renos/1').set('Authorization', 'Bearer x.y.z');
    expectFormatoError(res, 401, 'TOKEN_INVALIDO');
  });
  test('GET /vuelo/resumen: listo con 9 renos y pista COMPLETADO', async () => {
    const { Mantenimiento } = require('../src/models');
    await Reno.bulkCreate(Array.from({ length: 9 }, (_, i) => ({
      nombre: `R${i}`, edad: 5, nivelEnergia: 80 + i, estado: 'ASIGNADO_VUELO',
    })));
    let res = await request(app).get('/api/vuelo/resumen');
    expect(res.body).toMatchObject({ totalAsignados: 9, energiaPromedio: 84, vueloListo: false });
    await Mantenimiento.create({ zona: 'PISTA_DESPEGUE', tipo: 'LIMPIEZA_NIEVE', fechaProgramada: FUTURA, responsable: 'x', estado: 'COMPLETADO' });
    res = await request(app).get('/api/vuelo/resumen');
    expect(res.body.vueloListo).toBe(true);
  });
});
