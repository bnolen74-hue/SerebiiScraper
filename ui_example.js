// React Native example component demonstrating PokedexScreen
// (this file is just illustrative; adapt to your Expo/React Native project)

import React from 'react';
import { View, Text, StyleSheet, TextInput, Animated, TouchableOpacity } from 'react-native';
import { useFonts } from 'expo-font';

// load a retro pixel font for the app
function usePressStart() {
  const [fontsLoaded] = useFonts({
    PressStart2P: require('./assets/fonts/PressStart2P.ttf'),
  });
  return fontsLoaded;
}

export const PokedexScreen = ({ children }) => (
  <View style={styles.screenContainer}>
    <View style={styles.screen}>
      {children}
    </View>
  </View>
);

const styles = StyleSheet.create({
  screenContainer: {
    backgroundColor: '#a0a0b0',
    borderRadius: 20,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  screen: {
    backgroundColor: '#0f380f',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#6b8c6b',
    // Optional: inner "glow"
    shadowColor: '#8bac0f',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },

  searchContainer: {
    padding: 20,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#8bac0f',
    padding: 10,
    marginBottom: 8,
    color: '#fff',
    borderRadius: 4,
    fontFamily: 'PressStart2P',
    fontSize: 10,
    backgroundColor: '#0f380f',
  },
  searchButton: {
    backgroundColor: '#8bac0f',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 8,
  },
  searchButtonText: {
    color: '#0f380f',
    fontFamily: 'PressStart2P',
    fontSize: 10,
  },
});

// higher-order wrapper that waits for fonts
function WithFonts({ children }) {
  const ok = usePressStart();
  if (!ok) return null;
  return children;
}

// usage example - simple static text
export function ExampleStatic() {
  return (
    <WithFonts>
      <PokedexScreen>
        <Text style={{ color: '#fff', fontFamily: 'PressStart2P', fontSize: 12 }}>
          Hello, Pokedex!
        </Text>
      </PokedexScreen>
    </WithFonts>
  );
}

// usage example - fetch a pokemon from the local server
// parameterized fetch component
export function PokemonLookup({ name }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!name) return;
    setLoading(true);
    fetch(`http://localhost:3000/pokemon/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((j) => {
        setData(j);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [name]);

  return (
    <PokedexScreen>
      {loading && <Text style={{ color: '#fff' }}>Loading...</Text>}
      {error && <Text style={{ color: '#f88' }}>{error}</Text>}
      {data && (
        <Text style={{ color: '#fff' }}>
          {data.name} (Gen {data.gen})
        </Text>
      )}
    </PokedexScreen>
  );
}

// simple search UI using the lookup component
export function ExampleSearch() {
  const [query, setQuery] = React.useState('');
  const [target, setTarget] = React.useState('');
  const scale = React.useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <WithFonts>
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
            onPress={() => setTarget(query.trim().toLowerCase())}
            onPressIn={pressIn}
            onPressOut={pressOut}
            activeOpacity={0.8}
          >
            <Text style={styles.searchButtonText}>Lookup</Text>
          </TouchableOpacity>
        </Animated.View>
        {target ? (
          <PokemonLookup name={target} />
        ) : (
          <Text style={{ color: '#fff', marginTop: 16 }}>No query</Text>
        )}
      </View>
    </WithFonts>
  );
}
