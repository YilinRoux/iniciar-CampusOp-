import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SessionScreen } from '../../src/campusops/ui/SessionScreen';
import { SessionManager } from '../../src/campusops/application/sessionManager';
import type { CampusRole } from '../../src/campusops/domain/session';

function setup() {
  let saved: string | null = null;
  const manager = new SessionManager({
    now: () => 0,
    store: { save: async (value) => { saved = value; }, load: async () => saved, clear: async () => { saved = null; } },
    transport: {
      login: async (actorId) => ({
        actorId, role: actorId.split('-')[0] as CampusRole,
        accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresIn: 60,
      }),
      refresh: async () => ({ accessToken: 'fixture-new', refreshToken: 'fixture-next', expiresIn: 60 }),
    },
  });
  const incident = { id: 'campus-inc-001', category: 'connectivity', description: 'Falla ficticia', location: 'Zona ficticia', status: 'assigned' as const, assignedTechnicianId: 'technician-1' };
  return {
    manager, saved: () => saved,
    repository: { getIncidents: async () => [incident], getIncidentById: async () => incident },
    creator: { createIncident: jest.fn(async () => incident) },
    actions: { perform: jest.fn(async () => 'resolved') },
    onError: jest.fn(),
  };
}

test.each([
  ['Reportante 1', 'reporter', 'Crear incidencia'],
  ['Tecnico 1', 'technician', 'Resolver incidencia'],
  ['Coordinador', 'coordinator', 'Cerrar incidencia'],
])('la pantalla inicia sesión como %s y muestra su operación', async (actor, role, operation) => {
  const h = setup();
  const view = await render(<SessionScreen {...h} />);
  await waitFor(() => expect(view.getByText(actor)).toBeTruthy());
  await fireEvent.press(view.getByText(actor));
  await waitFor(() => expect(view.getByText(`Perfil: ${role}`)).toBeTruthy());
  expect(view.getByText(operation)).toBeTruthy();
  expect(view.queryByText('fixture-access')).toBeNull();
  await fireEvent.press(view.getByText('Cerrar sesion'));
  await waitFor(() => expect(view.getByText('Selecciona un actor ficticio para iniciar sesion')).toBeTruthy());
  expect(h.saved()).toBeNull();
  expect(view.queryByText(`Perfil: ${role}`)).toBeNull();
});
