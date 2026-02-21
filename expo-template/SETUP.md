# Pokédex Screen Setup

## Overview
This Expo template includes a custom `PokedexScreen` component with a retro Game Boy Pokédex aesthetic.

## Components

### PokedexScreen
A reusable component that provides the classic Pokédex screen styling with hardware-like appearance.

```javascript
import PokedexScreen from './components/PokedexScreen';

// Inside your component:
<PokedexScreen>
  <Text>Your content here</Text>
</PokedexScreen>
```

## Fonts

The app uses the **Press Start 2P** font for an authentic retro Game Boy feel.

### Setting up fonts:
1. Download any TTF fonts you want (e.g., Press Start 2P from Google Fonts)
2. Place them in `assets/fonts/`
3. Fonts are automatically loaded in the `usePressStart()` hook in App.js

### Available fonts:
- **PressStart2P** - Default retro Game Boy font

To add more fonts:
1. Add the .ttf file to `assets/fonts/`
2. Update the `usePressStart()` function in App.js:
   ```javascript
   const [loaded] = useFonts({
     PressStart2P: require('./assets/fonts/PressStart2P.ttf'),
     YourNewFont: require('./assets/fonts/YourNewFont.ttf'),
   });
   ```

## Theme
Use the `theme.js` file for consistent colors and styling across the app:

```javascript
import { PokemonColors, PokemonFonts } from './theme';

// Use colors
style={{color: PokemonColors.accent}}

// Use fonts
style={{fontFamily: PokemonFonts.primary}}
```

## Colors

- **Bezel**: #a0a0b0 (Hardware gray)
- **Screen Background**: #0f380f (Game Boy green)
- **Screen Border**: #6b8c6b (Darker green)
- **Accent**: #8bac0f (Bright Game Boy green)

## Next Steps
- Import PressStart2P.ttf into `assets/fonts/`
- Customize colors in `theme.js` as needed
- Extend PokedexScreen with additional styling variants
