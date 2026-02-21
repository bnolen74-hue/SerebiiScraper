import { useFonts } from 'expo-font';

export function usePokemonFonts() {
  const [loaded] = useFonts({
    PressStart2P: require('../assets/fonts/PressStart2P.ttf'),
    PressStart2P_Regular: require('../assets/fonts/PressStart2P.ttf'),
  });
  return loaded;
}

export default usePokemonFonts;
