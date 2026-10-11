import { useEffect, useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import type { SessionManager } from '../application/sessionManager';
import type { IncidentCreator, IncidentRepository } from '../domain/incident';
import type { IncidentActions, SessionIncidentAction } from '../domain/incidentActions';
import type { LogSink } from '../application/reportError';
import { IncidentListScreen } from './IncidentListScreen';

const actors = [
  ['reporter-1', 'Reportante 1'], ['reporter-2', 'Reportante 2'],
  ['technician-1', 'Tecnico 1'], ['technician-2', 'Tecnico 2'],
  ['coordinator-1', 'Coordinador'],
] as const;

export function SessionScreen({ manager, repository, creator, actions, onError }: {
  manager: SessionManager; repository: IncidentRepository; creator: IncidentCreator;
  actions: IncidentActions; onError: LogSink;
}) {
  const [session, setSession] = useState(() => manager.view());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [incidentId, setIncidentId] = useState('campus-inc-001');
  const [diagnosis, setDiagnosis] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    let active = true;
    let previousActor = manager.view().actorId;
    const unsubscribe = manager.subscribe(() => {
      if (!active) return;
      const next = manager.view();
      if (next.actorId !== previousActor) {
        setDescription(''); setLocation(''); setDiagnosis(''); setMessage('');
        setIncidentId('campus-inc-001');
        previousActor = next.actorId;
      }
      setSession(next);
    });
    manager.restore().catch(() => { if (active) setMessage('No se pudo recuperar la sesion'); })
      .finally(() => { if (active) { setSession(manager.view()); setReady(true); } });
    return () => { active = false; unsubscribe(); };
  }, [manager]);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try { await operation(); } catch { setMessage('No se pudo completar. Revisa sesion, permisos y conexion.'); }
    finally { setBusy(false); }
  }

  async function perform(action: SessionIncidentAction) {
    await run(async () => {
      const status = await actions.perform(incidentId, action, action === 'resolve' ? diagnosis : undefined);
      setMessage(`Estado: ${status}`);
      setRevision((value) => value + 1);
    });
  }

  if (!ready) return <Text>Recuperando sesion...</Text>;
  return <View style={{ gap: 8 }}>
    <Text>Sesion: {session.status}</Text>
    {session.status === 'anonymous' || session.status === 'logging_in' ? <>
      <Text>Selecciona un actor ficticio para iniciar sesion</Text>
      {actors.map(([actorId, label]) => <Button key={actorId} title={label} disabled={busy}
        onPress={() => { void run(() => manager.login(actorId)); }} />)}
    </> : <>
      <Text>Perfil: {session.role}</Text>
      <Button title="Cerrar sesion" onPress={() => { void run(() => manager.logout()); }} />
      {session.actorId && <IncidentListScreen key={`${session.actorId}-${revision}`} repository={repository} onError={onError} />}
      {session.role === 'reporter' && <>
        <Text>Reportar incidencia de conectividad</Text>
        <TextInput accessibilityLabel="Descripcion" placeholder="Descripcion" value={description} onChangeText={setDescription} />
        <TextInput accessibilityLabel="Ubicacion ficticia" placeholder="Ubicacion ficticia" value={location} onChangeText={setLocation} />
        <Button title="Crear incidencia" disabled={busy || !description.trim() || !location.trim()} onPress={() => {
          void run(async () => {
            await creator.createIncident({ category: 'connectivity', description, location }, `session-create-${Date.now()}`);
            setDescription(''); setLocation(''); setRevision((value) => value + 1);
          });
        }} />
      </>}
      {(session.role === 'technician' || session.role === 'coordinator') && <>
        <TextInput accessibilityLabel="ID de incidencia" value={incidentId} onChangeText={setIncidentId} />
        {session.role === 'technician' ? <>
          <Button title="Iniciar atencion" disabled={busy} onPress={() => { void perform('start'); }} />
          <TextInput accessibilityLabel="Diagnostico" placeholder="Diagnostico" value={diagnosis} onChangeText={setDiagnosis} />
          <Button title="Resolver incidencia" disabled={busy || !diagnosis.trim()} onPress={() => { void perform('resolve'); }} />
        </> : <>
          <Button title="Cerrar incidencia" disabled={busy} onPress={() => { void perform('close'); }} />
          <Button title="Reabrir incidencia" disabled={busy} onPress={() => { void perform('reopen'); }} />
        </>}
      </>}
    </>}
    {message !== '' && <Text accessibilityRole="alert">{message}</Text>}
  </View>;
}
