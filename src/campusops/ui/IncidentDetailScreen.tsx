import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Incident, IncidentRepository } from '../domain/incident';
import { getIncidentDetail } from '../application/getIncidentDetail';

export function IncidentDetailScreen({ incidentId, repository }: { incidentId: string; repository: IncidentRepository }) {
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    getIncidentDetail(repository, incidentId).then(setIncident);
  }, [incidentId, repository]);

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
