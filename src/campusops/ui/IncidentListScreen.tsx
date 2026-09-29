import React, { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { Incident, IncidentRepository } from '../domain/incident';
import { getIncidents } from '../application/getIncidents';
import { LogSink } from '../application/reportError';

export function IncidentListScreen({
  repository,
  onError = () => {},
}: {
  repository: IncidentRepository;
  onError?: LogSink;
}) {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    getIncidents(repository, onError).then(setIncidents).catch(() => {});
  }, [repository, onError]);

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
