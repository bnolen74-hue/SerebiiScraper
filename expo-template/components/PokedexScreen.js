import React from 'react';
import { View, StyleSheet } from 'react-native';

const PokedexScreen = ({ children }) => (
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
});

export default PokedexScreen;
