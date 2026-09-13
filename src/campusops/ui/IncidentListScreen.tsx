import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Incident, IncidentRepository } from '../domain/incident';
import { getIncidents } from '../application/getIncidents';

export function IncidentListScreen({ repository }: { repository: IncidentRepository }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    getIncidents(repository).then(setIncidents);
  }, [repository]);

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
