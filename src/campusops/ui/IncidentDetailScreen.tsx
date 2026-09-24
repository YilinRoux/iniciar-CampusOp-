import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Actor, IncidentRepository } from '../domain/incident';
import { getIncidentDetail, IncidentDetailResult } from '../application/getIncidentDetail';

export function IncidentDetailScreen({
  incidentId,
  repository,
  actor,
}: {
  incidentId: string;
  repository: IncidentRepository;
  actor: Actor;
}) {
  const [result, setResult] = useState<IncidentDetailResult | null>(null);

  useEffect(() => {
    getIncidentDetail(repository, incidentId, actor).then(setResult);
  }, [incidentId, repository, actor]);

  if (!result) return <Text>Cargando...</Text>;

  if (result.status === 'forbidden') {
    return <Text>No tienes permiso para ver esta incidencia.</Text>;
  }

  if (result.status === 'not_found') {
    return <Text>Incidencia no encontrada.</Text>;
  }

  const { incident } = result;
  return (
    <View>
      <Text>{incident.category}</Text>
      <Text>{incident.description}</Text>
      <Text>{incident.location}</Text>
      <Text>{incident.status}</Text>
    </View>
  );
}