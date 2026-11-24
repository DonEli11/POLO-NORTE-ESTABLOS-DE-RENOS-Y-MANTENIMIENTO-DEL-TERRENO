const mockApp = require('../mock/meteo-server');
const { MeteoAdapter, ServicioExternoNoDisponibleError } = require('../src/adapters/MeteoAdapter');

let server;
let url;

beforeAll((done) => {
  server = mockApp.listen(0, () => {
    url = `http://localhost:${server.address().port}/meteo`;
    done();
  });
});
afterAll((done) => { server.close(done); });
afterEach(() => { delete process.env.METEO_MOCK_DELAY_MS; });

const adapter = (opts = {}) => new MeteoAdapter({ url, timeoutMs: 1000, backoffMs: 10, ...opts });

describe('MeteoAdapter (XML <-> dominio)', () => {
  test.each([
    ['2030-12-19', 'DESPEJADO'],
    ['2030-12-20', 'NEVADA_LEVE'],
    ['2030-12-21', 'VENTISCA'],
  ])('fecha %s -> objeto de dominio con %s', async (fecha, condicion) => {
    await expect(adapter().obtenerPronostico('PISTA_DESPEGUE', fecha))
      .resolves.toEqual({ zona: 'PISTA_DESPEGUE', fecha, condicion });
  });

  test('soap:Fault (2026-12-24) -> ServicioExternoNoDisponibleError tras 2 intentos', async () => {
    const a = adapter();
    const spy = jest.spyOn(a, 'llamarUnaVez');
    const err = await a.obtenerPronostico('PISTA_DESPEGUE', '2026-12-24').catch((e) => e);
    expect(err).toBeInstanceOf(ServicioExternoNoDisponibleError);
    expect(err.motivo).toMatch(/Estación sin señal/);
    expect(err.intentos).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('timeout -> ServicioExternoNoDisponibleError', async () => {
    process.env.METEO_MOCK_DELAY_MS = '400';
    const err = await adapter({ timeoutMs: 150 }).obtenerPronostico('PISTA_DESPEGUE', '2030-12-19').catch((e) => e);
    expect(err).toBeInstanceOf(ServicioExternoNoDisponibleError);
    expect(err.motivo).toMatch(/sin respuesta en 150 ms/);
  });

  test('servicio apagado -> ServicioExternoNoDisponibleError', async () => {
    const err = await adapter({ url: 'http://localhost:1/meteo' }).obtenerPronostico('PISTA_DESPEGUE', '2030-12-19').catch((e) => e);
    expect(err).toBeInstanceOf(ServicioExternoNoDisponibleError);
  });

  test('construye el envelope SOAP del enunciado', () => {
    const xml = adapter().construirRequest('PISTA_DESPEGUE', '2026-12-20');
    expect(xml).toContain('<mt:zona>PISTA_DESPEGUE</mt:zona>');
    expect(xml).toContain('<mt:fecha>2026-12-20</mt:fecha>');
  });
});
