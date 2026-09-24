import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Actor, Incident, IncidentRepository } from '../domain/incident';
import { getIncidents } from '../application/getIncidents';

export function IncidentListScreen({
  repository,
  actor,
}: {
  repository: IncidentRepository;
  actor: Actor;
}) {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    getIncidents(repository, actor).then(setIncidents);
  }, [repository, actor]);

  return (
    <View>
      <FlatList
        data={incidents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.category}</Text>
            <Text>{item.description}</Text>
            <Text>{item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}