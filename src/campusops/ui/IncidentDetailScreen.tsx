import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Incident, IncidentRepository } from '../domain/incident';
import { getIncidentDetail } from '../application/getIncidentDetail';
import { LogSink } from '../application/reportError';

export function IncidentDetailScreen({
  incidentId,
  repository,
  onError = () => {},
}: {
  incidentId: string;
  repository: IncidentRepository;
  onError?: LogSink;
}) {
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    getIncidentDetail(repository, incidentId, onError).then(setIncident).catch(() => {});
  }, [incidentId, repository, onError]);

  if (!incident) return <Text>Cargando...</Text>;

  return (
    <View>
      <Text>{incident.category}</Text>
      <Text>{incident.description}</Text>
      <Text>{incident.location}</Text>
      <Text>{incident.status}</Text>
    </View>
  );
}
