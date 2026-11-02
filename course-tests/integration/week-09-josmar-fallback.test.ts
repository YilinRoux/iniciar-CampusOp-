import { selectIncidentLocation } from '../../src/course-evaluation';

describe('Semana 09 - Josmar: fallback de ubicación manual', () => {
  test('J1: utiliza la ubicación manual cuando el proveedor no responde', () => {
    const result = selectIncidentLocation(
      null,
      'Edificio ficticio, acceso norte',
    );

    expect(result).toEqual({
      source: 'manual',
      label: 'Edificio ficticio, acceso norte',
    });

    expect(result).not.toHaveProperty('latitude');
    expect(result).not.toHaveProperty('longitude');
  });

  test('J2: utiliza la ubicación manual cuando las coordenadas son inválidas', () => {
    const result = selectIncidentLocation(
      {
        label: 'Punto de prueba',
        latitude: 999,
        longitude: -98.2,
      },
      'Referencia manual de prueba',
    );

    expect(result).toEqual({
      source: 'manual',
      label: 'Referencia manual de prueba',
    });

    expect(result).not.toHaveProperty('latitude');
    expect(result).not.toHaveProperty('longitude');
  });

  test('J3: conserva la ubicación del proveedor cuando las coordenadas son válidas', () => {
    const result = selectIncidentLocation(
      {
        label: 'Zona ficticia',
        latitude: 19.04,
        longitude: -98.2,
      },
      'Referencia manual de prueba',
    );

    expect(result).toEqual({
      source: 'provider',
      label: 'Zona ficticia',
      latitude: 19.04,
      longitude: -98.2,
    });
  });

  test('J4: utiliza la ubicación manual cuando el proveedor devuelve una etiqueta vacía', () => {
    const result = selectIncidentLocation(
      {
        label: '   ',
        latitude: 19.04,
        longitude: -98.2,
      },
      'Referencia manual de prueba',
    );

    expect(result).toEqual({
      source: 'manual',
      label: 'Referencia manual de prueba',
    });

    expect(result).not.toHaveProperty('latitude');
    expect(result).not.toHaveProperty('longitude');
  });
});