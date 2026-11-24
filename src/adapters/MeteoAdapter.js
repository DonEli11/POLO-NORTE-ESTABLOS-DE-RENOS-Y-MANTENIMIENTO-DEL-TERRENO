/**
 * Adaptador del servicio SOAP heredado MeteoPoloNorteService.
 * Es el ÚNICO lugar del sistema que conoce XML/SOAP: recibe parámetros de dominio
 * y devuelve un objeto de dominio { zona, fecha, condicion }.
 *
 * Fallos (timeout de 3 s, error de red, soap:Fault, respuesta inválida) se traducen a
 * ServicioExternoNoDisponibleError tras reintentar con backoff (máx. 2 intentos).
 */
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const CONDICIONES = ['DESPEJADO', 'NEVADA_LEVE', 'VENTISCA'];

class ServicioExternoNoDisponibleError extends Error {
  constructor(motivo, intentos) {
    super(motivo);
    this.motivo = motivo;
    this.intentos = intentos;
  }
}

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

class MeteoAdapter {
  constructor(opciones = {}) {
    this.opciones = opciones;
    this.parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
  }

  // Configuración leída en cada llamada (permite cambiar .env / tests)
  get config() {
    return {
      url: this.opciones.url || process.env.METEO_URL,
      timeoutMs: Number(this.opciones.timeoutMs || process.env.METEO_TIMEOUT_MS || 3000),
      intentos: Number(this.opciones.intentos || process.env.METEO_MAX_INTENTOS || 2),
      backoffMs: Number(this.opciones.backoffMs ?? process.env.METEO_BACKOFF_MS ?? 300),
      soapAction: this.opciones.soapAction || process.env.METEO_SOAP_ACTION || 'ObtenerPronostico',
    };
  }

  /** Objeto de dominio -> XML */
  construirRequest(zona, fecha) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mt="http://polonorte.beatiech/meteo">
  <soapenv:Body>
    <mt:ObtenerPronosticoRequest>
      <mt:zona>${escapeXml(zona)}</mt:zona>
      <mt:fecha>${escapeXml(fecha)}</mt:fecha>
    </mt:ObtenerPronosticoRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  /** XML -> objeto de dominio (o lanza si es Fault / inválido) */
  parsearRespuesta(xml, zona, fecha) {
    let body;
    try {
      body = this.parser.parse(xml)?.Envelope?.Body;
    } catch {
      throw new Error('respuesta XML inválida');
    }
    if (!body) throw new Error('respuesta sin soap:Body');
    if (body.Fault) throw new Error(`${body.Fault.faultcode}: ${body.Fault.faultstring}`);

    const condicion = body.ObtenerPronosticoResponse?.pronostico;
    if (!CONDICIONES.includes(condicion)) throw new Error(`pronóstico desconocido: ${condicion}`);
    return { zona, fecha, condicion };
  }

  async llamarUnaVez(zona, fecha) {
    const { url, timeoutMs, soapAction } = this.config;
    let res;
    try {
      res = await axios.post(url, this.construirRequest(zona, fecha), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: soapAction },
        timeout: timeoutMs,
        responseType: 'text',
        validateStatus: () => true, // el Fault llega con HTTP 500: lo analizamos nosotros
      });
    } catch (err) {
      throw new Error(err.code === 'ECONNABORTED' ? `sin respuesta en ${timeoutMs} ms` : `error de red (${err.code || err.message})`);
    }
    return this.parsearRespuesta(res.data, zona, fecha);
  }

  /** API pública del adaptador: devuelve { zona, fecha, condicion } */
  async obtenerPronostico(zona, fecha) {
    const { intentos, backoffMs } = this.config;
    let ultimoError;
    for (let intento = 1; intento <= intentos; intento += 1) {
      try {
        return await this.llamarUnaVez(zona, fecha);
      } catch (err) {
        ultimoError = err;
        if (intento < intentos) await esperar(backoffMs * 2 ** (intento - 1)); // backoff exponencial
      }
    }
    throw new ServicioExternoNoDisponibleError(ultimoError.message, intentos);
  }
}

module.exports = { MeteoAdapter, ServicioExternoNoDisponibleError, meteoAdapter: new MeteoAdapter() };
