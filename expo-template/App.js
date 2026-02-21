// this is a skeleton App.js you can drop into a fresh Expo project

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';

function usePressStart() {
  const [loaded] = useFonts({
    PressStart2P: require('./assets/fonts/PressStart2P.ttf'),
  });
  return loaded;
}

export default function App() {
  const [query, setQuery] = React.useState('');
  const [target, setTarget] = React.useState('');
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const scale = React.useRef(new Animated.Value(1)).current;

  const pressIn = () => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  React.useEffect(() => {
    if (!target) return;
    setLoading(true);
    fetch(`http://10.0.2.2:3000/pokemon/${encodeURIComponent(target)}`) // use emulator host or adjust
      .then((r) => r.json())
      .then((j) => {
        setData(j);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [target]);

  if (!usePressStart()) return null;

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>
        <View style={styles.screen}>
          <View style={styles.searchContainer}>
            <TextInput
              placeholder="Enter Pokemon name"
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholderTextColor="#ccc"
            />
            <Animated.View style={{ transform: [{ scale }] }}>
              <TouchableOpacity
                style={styles.searchButton}
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={() => setTarget(query.trim().toLowerCase())}
                activeOpacity={0.8}
              >
                <Text style={styles.searchButtonText}>Lookup</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
          {loading && <Text style={{ color: '#fff' }}>Loading...</Text>}
          {error && <Text style={{ color: '#f88' }}>{error}</Text>}
          {data && (
            <Text style={{ color: '#fff' }}>
              {data.name} (Gen {data.gen})
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#a0a0b0' },
  screenContainer: { backgroundColor: '#a0a0b0', borderRadius: 20, padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
  screen: { backgroundColor: '#0f380f', borderRadius: 12, padding: 16, borderWidth: 2, borderColor: '#6b8c6b', shadowColor: '#8bac0f', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 8 },
  searchContainer: { padding: 20 },
  searchInput: { borderWidth: 1, borderColor: '#8bac0f', padding: 10, marginBottom: 8, color: '#fff', borderRadius: 4, fontFamily: 'PressStart2P', fontSize: 10, backgroundColor: '#0f380f' },
  searchButton: { backgroundColor: '#8bac0f', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 4, alignItems: 'center', marginBottom: 8 },
  searchButtonText: { color: '#0f380f', fontFamily: 'PressStart2P', fontSize: 10 },
});