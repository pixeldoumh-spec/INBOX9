import { listShelexCountries, listShelexIndiaNumbers, shelexBaseUrl } from '../api/_lib/shelex-diagnostics.js';

function findIndia(countries) {
  if (!Array.isArray(countries)) return null;
  return countries.find((value) => String(value).trim().toLowerCase() === 'india') || null;
}

function listCount(body) {
  if (Array.isArray(body)) return body.length;
  if (body && Array.isArray(body.numbers)) return body.numbers.length;
  if (body && Array.isArray(body.data)) return body.data.length;
  return null;
}

try {
  const countries = await listShelexCountries();
  const india = findIndia(countries);
  let indiaPublicNumberCount = null;
  if (india) {
    const numbers = await listShelexIndiaNumbers();
    indiaPublicNumberCount = listCount(numbers);
  }
  console.log(JSON.stringify({
    ok: Boolean(india),
    baseUrl: shelexBaseUrl(),
    countries: Array.isArray(countries) ? countries.length : null,
    indiaAvailable: Boolean(india),
    indiaPublicNumberCount,
    customerActivations: false,
  }, null, 2));
  if (!india) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    baseUrl: shelexBaseUrl(),
    error: String(error?.message || error).slice(0, 300),
  }, null, 2));
  process.exitCode = 1;
}
