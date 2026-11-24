/**
 * Mock LOCAL del servicio SOAP MeteoPoloNorteService (para desarrollo; en el examen usa el del docente).
 * Reglas según la fecha solicitada:
 *   2026-12-24        -> soap:Fault "Estación sin señal" (igual que el mock del docente)
 *   2026-12-23        -> tarda 5 s (simula timeout)
 *   día múltiplo de 3 -> VENTISCA      (ej. 2026-12-21)
 *   día par           -> NEVADA_LEVE   (ej. 2026-12-20)
 *   resto             -> DESPEJADO     (ej. 2026-12-19)
 * METEO_MOCK_DELAY_MS agrega un retraso a todas las respuestas.
 */
const express = require('express');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const parser = new XMLParser({ removeNSPrefix: true });
const PORT = Number(process.env.METEO_MOCK_PORT || 8089);

app.use(express.text({ type: ['text/xml', 'application/soap+xml', 'application/xml'] }));

const envelope = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:mt="http://polonorte.beatiech/meteo">
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`;

const fault = (msg) => envelope(`
    <soapenv:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>${msg}</faultstring>
    </soapenv:Fault>`);

function pronosticoPara(fecha) {
  if (fecha === '2026-12-24') return null;
  const dia = Number(String(fecha).slice(8, 10));
  if (dia % 3 === 0) return 'VENTISCA';
  if (dia % 2 === 0) return 'NEVADA_LEVE';
  return 'DESPEJADO';
}

app.post('/meteo', (req, res) => {
  let reqBody;
  try {
    reqBody = parser.parse(req.body || '')?.Envelope?.Body?.ObtenerPronosticoRequest;
  } catch { /* noop */ }

  const responder = () => {
    res.type('text/xml');
    if (!reqBody?.zona || !reqBody?.fecha) return res.status(500).send(fault('Request inválido'));

    const p = pronosticoPara(reqBody.fecha);
    console.log(`[meteo-mock] ${reqBody.zona} ${reqBody.fecha} -> ${p || 'FAULT'}`);
    if (!p) return res.status(500).send(fault('Estación sin señal'));

    return res.send(envelope(`
      <mt:ObtenerPronosticoResponse>
        <mt:pronostico>${p}</mt:pronostico>
      </mt:ObtenerPronosticoResponse>`));
  };

  const delay = Number(process.env.METEO_MOCK_DELAY_MS || 0) + (reqBody?.fecha === '2026-12-23' ? 5000 : 0);
  if (!delay) return responder();

  const timer = setTimeout(responder, delay);
  res.once('close', () => clearTimeout(timer));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Mock MeteoPoloNorteService SOAP en http://localhost:${PORT}/meteo`));
}

module.exports = app;
