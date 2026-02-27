const BACKEND = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : `http://${location.hostname}:3000`;

// Fetch Gen 5 animated sprite from PokeAPI with fallback
// Uses Black/White animated sprites showing idle movement
async function fetchGen5AnimatedSprite(pokemonUrl) {
  try {
    const resp = await fetch(pokemonUrl);
    if (resp.ok) {
      const data = await resp.json();
      // Try Gen 5 animated sprite first (idle movement from Black/White)
      const gen5Animated = data.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default;
      if (gen5Animated) return gen5Animated;
      
      // Fallback to static Gen 5 sprite
      const gen5Static = data.sprites?.versions?.['generation-v']?.['black-white']?.front_default;
      if (gen5Static) return gen5Static;
      
      // Fallback to official artwork
      const officialArt = data.sprites?.other?.['official-artwork']?.front_default;
      if (officialArt) return officialArt;
      
      // Last resort
      return data.sprites?.front_default;
    }
  } catch (e) {
    // Fallback to front_default
  }
  return null;
}

function createGbaVersionStore(initialVersion = 'firered-leafgreen') {
  let current = initialVersion;
  const listeners = new Set();

  return {
    get() {
      return current;
    },
    set(nextVersion) {
      if (!nextVersion || nextVersion === current) return;
      current = nextVersion;
      listeners.forEach(listener => listener(current));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

async function lookup(name) {
  const out = document.getElementById('output');
  out.textContent = 'Loading...';
  addHistory(name);
  clearSuggestions();
  try {
    const res = await fetch(`${BACKEND}/pokemon/${encodeURIComponent(name)}`);
    if (res.ok) {
      const entry = await res.json();
      await displayEntry(entry);
    } else {
      out.textContent = `Error ${res.status}`;
    }
  } catch (e) {
    out.textContent = `Network error: ${e}`;
  }
}

async function displayEntry(entry) {
  const out = document.getElementById('output');
  out.innerHTML = '';
  const gbaVersionStore = createGbaVersionStore('firered-leafgreen');

  const title = document.createElement('h2');
  title.textContent = entry.name;
  out.appendChild(title);

  if (entry.serebii_url) {
    const a = document.createElement('a');
    a.href = entry.serebii_url;
    a.textContent = 'View on Serebii';
    a.target = '_blank';
    out.appendChild(a);
  }

  const locationSection = document.createElement('div');
  locationSection.style.marginTop = '10px';
  const locationList = document.createElement('ul');
  const loadingItem = document.createElement('li');
  loadingItem.textContent = 'Loading locations...';
  locationList.appendChild(loadingItem);
  locationSection.appendChild(locationList);
  out.appendChild(locationSection);

  try {
    const locResp = await fetch(`${BACKEND}/pokemon/${encodeURIComponent(entry.name)}/locations`);
    if (locResp.ok) {
      const locData = await locResp.json();
      const tabsPayload = locData?.tabs || {};
      const frlgTab = tabsPayload.FRLG || { label: 'FireRed/LeafGreen', routes: [], other: [] };
      const rseTab = tabsPayload.RSE || { label: 'Ruby/Sapphire/Emerald', routes: [], other: [] };

      locationList.innerHTML = '';

      const hasAnyLocations =
        (frlgTab.routes && frlgTab.routes.length) ||
        (frlgTab.other && frlgTab.other.length) ||
        (rseTab.routes && rseTab.routes.length) ||
        (rseTab.other && rseTab.other.length);

      if (hasAnyLocations) {
        const gameTabs = {
          'firered-leafgreen': {
            label: 'FireRed/LeafGreen',
            routes: Array.isArray(frlgTab.routes) ? frlgTab.routes : [],
            other: Array.isArray(frlgTab.other) ? frlgTab.other : []
          },
          'ruby-sapphire': {
            label: 'Ruby/Sapphire',
            routes: Array.isArray(rseTab.routes) ? rseTab.routes : [],
            other: Array.isArray(rseTab.other) ? rseTab.other : []
          },
          'emerald': {
            label: 'Emerald',
            routes: Array.isArray(rseTab.routes) ? rseTab.routes : [],
            other: Array.isArray(rseTab.other) ? rseTab.other : []
          }
        };

        const orderedGames = ['firered-leafgreen', 'ruby-sapphire', 'emerald'];
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'tabs';
        const contentDiv = document.createElement('div');
        contentDiv.className = 'tab-content';

        const dedupeAndSortByName = (names) => {
          const unique = Array.from(new Set(names));
          unique.sort((a, b) => {
            const aNum = parseInt((a.match(/\d+/) || ['0'])[0], 10);
            const bNum = parseInt((b.match(/\d+/) || ['0'])[0], 10);
            if (aNum !== bNum) return aNum - bNum;
            return a.localeCompare(b);
          });
          return unique;
        };

        const showGameTab = (gameKey, btn, updateStore = true) => {
          Array.from(tabsDiv.querySelectorAll('.tab-btn')).forEach(b => b.classList.remove('active'));
          if (btn) btn.classList.add('active');

          contentDiv.innerHTML = '';
          const tabData = gameTabs[gameKey] || { routes: [], other: [] };
          const routes = dedupeAndSortByName(tabData.routes || []);
          const fallbackAreas = dedupeAndSortByName(tabData.other || []);
          const itemsToShow = routes.length ? routes : fallbackAreas;

          if (updateStore) {
            gbaVersionStore.set(gameKey);
          }

          const sectionTitle = document.createElement('div');
          sectionTitle.style.marginBottom = '6px';
          sectionTitle.style.fontSize = '10px';
          sectionTitle.innerHTML = `<strong>Locations:</strong> ${tabData.label || gameKey}`;
          contentDiv.appendChild(sectionTitle);

          if (!itemsToShow.length) {
            const none = document.createElement('div');
            none.textContent = 'No locations found for this game.';
            none.style.fontSize = '10px';
            none.style.color = '#888';
            contentDiv.appendChild(none);
            return;
          }

          const ul = document.createElement('ul');
          ul.style.marginTop = '0';
          ul.style.marginBottom = '0';
          ul.style.paddingLeft = '20px';
          itemsToShow.forEach(route => {
            const li = document.createElement('li');
            li.textContent = route;
            li.style.marginBottom = '4px';
            ul.appendChild(li);
          });
          contentDiv.appendChild(ul);
        };

        const buttonByGame = {};
        let firstBtn = null;
        orderedGames.forEach(gameKey => {
          const btn = document.createElement('button');
          btn.className = 'tab-btn';
          btn.textContent = gameTabs[gameKey].label;
          btn.addEventListener('click', () => showGameTab(gameKey, btn));
          tabsDiv.appendChild(btn);
          buttonByGame[gameKey] = btn;
          if (!firstBtn) firstBtn = btn;
        });

        gbaVersionStore.subscribe(selectedVersion => {
          const selectedBtn = buttonByGame[selectedVersion] || firstBtn;
          const selectedKey = buttonByGame[selectedVersion] ? selectedVersion : orderedGames[0];
          showGameTab(selectedKey, selectedBtn, false);
        });

        locationList.style.listStyle = 'none';
        locationList.style.paddingLeft = '0';
        const containerItem = document.createElement('li');
        containerItem.style.listStyle = 'none';
        containerItem.appendChild(tabsDiv);
        containerItem.appendChild(contentDiv);
        locationList.appendChild(containerItem);

        if (firstBtn) {
          const initialGame = orderedGames.includes(gbaVersionStore.get()) ? gbaVersionStore.get() : orderedGames[0];
          showGameTab(initialGame, buttonByGame[initialGame] || firstBtn, false);
          if (initialGame !== gbaVersionStore.get()) {
            gbaVersionStore.set(initialGame);
          }
        }
      } else {
        const none = document.createElement('li');
        none.textContent = 'No Gen 1–3 GBA location data for this Pokémon.';
        locationList.appendChild(none);
      }
    } else {
      loadingItem.textContent = 'Location data unavailable.';
    }
  } catch (_) {
    loadingItem.textContent = 'Location data unavailable.';
  }

  let spriteImg = null;

  if (entry.pokeapi_url) {
    // fetch the Pokemon data (not species), but we will also load chain members later
    let pokeData;
    try {
      pokeData = await (await fetch(entry.pokeapi_url.replace('pokemon-species', 'pokemon'))).json();
    } catch (_){ pokeData = null; }

    if (pokeData) {
      // Create a sprite image element that will be updated when tabs are clicked
      const spriteUrl = pokeData.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default 
        || pokeData.sprites?.versions?.['generation-v']?.['black-white']?.front_default
        || pokeData.sprites?.other?.['official-artwork']?.front_default
        || pokeData.sprites?.front_default;
      spriteImg = document.createElement('img');
      if (spriteUrl) {
        spriteImg.src = spriteUrl;
        spriteImg.style.maxWidth = '140px';
        spriteImg.style.imageRendering = 'pixelated';
      }
      out.appendChild(spriteImg);
    }

    // fetch species to get evolution chain and render the chain with levels
    try {
      const species = await (await fetch(entry.pokeapi_url)).json();
      let names = [entry.name]; // Start with current Pokemon
      let chains = [];
      
      if (species.evolution_chain && species.evolution_chain.url) {
        const evo = await (await fetch(species.evolution_chain.url)).json();
        chains = collectEvolutionChains(evo.chain);
        
        // Filter chains to only include gen 1-3 Pokemon
        chains = await filterChainsToGen1to3(chains);
        
        // Get names from filtered chains only
        names = [];
        chains.forEach(chain => {
          chain.forEach(stage => {
            if (!names.includes(stage.name)) {
              names.push(stage.name);
            }
          });
        });
      }
      
      // Always load stats/moves, even for single Pokemon with no evolution
      if (names.length === 0) {
        names = [entry.name];
      }
      
      await buildEvolutionTabs(names, chains, spriteImg, entry.name, gbaVersionStore);
    } catch (_){ /* ignore */ }
  }
}

function collectEvolutionNames(chain) {
  const out = [chain.species.name];
  if (chain.evolves_to && chain.evolves_to.length) {
    chain.evolves_to.forEach(c => {
      out.push(...collectEvolutionNames(c));
    });
  }
  return out;
}

// Filter evolution chains to only include gen 1-3 Pokemon
async function filterChainsToGen1to3(chains) {
  const genCache = {};
  
  const getPokemonGen = async (name) => {
    if (genCache[name]) return genCache[name];
    try {
      const speciesResp = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${name}`);
      if (speciesResp.ok) {
        const speciesData = await speciesResp.json();
        const gen = speciesData.generation?.url ? parseInt(speciesData.generation.url.split('/').slice(-2)[0]) : 0;
        genCache[name] = gen;
        return gen;
      }
    } catch (_) {}
    return 0;
  };
  
  const filteredChains = [];
  for (const chain of chains) {
    const filteredChain = [];
    for (const stage of chain) {
      const gen = await getPokemonGen(stage.name);
      if (gen >= 1 && gen <= 3) {
        filteredChain.push(stage);
      } else {
        break; // Stop when we hit a Pokemon outside gen 1-3
      }
    }
    if (filteredChain.length > 0) {
      filteredChains.push(filteredChain);
    }
  }
  
  return filteredChains;
}

// return an array of sequences; each sequence is list of {name, level, evolveInfo}
function collectEvolutionChains(chain) {
  const details = chain.evolution_details && chain.evolution_details[0];
  const level = details && details.min_level ? details.min_level : '';
  
  // Extract evolution info: method and level/trigger
  let evolveInfo = '';
  if (details) {
    const method = details.trigger?.name || '';
    const item = details.item?.name || '';
    const happiness = details.min_happiness;
    const minAffection = details.min_affection;
    const location = details.location?.name || '';
    const heldItem = details.held_item?.name || '';
    
    if (method === 'level-up') {
      if (details.min_level) {
        evolveInfo = `Level ${details.min_level}`;
      } else if (happiness) {
        evolveInfo = `Level up (Happiness)`;
      } else {
        evolveInfo = 'Level up';
      }
    } else if (method === 'use-item') {
      evolveInfo = `Use ${item.replace(/-/g, ' ')}`;
    } else if (method === 'trade') {
      if (heldItem) {
        evolveInfo = `Trade (holding ${heldItem.replace(/-/g, ' ')})`;
      } else {
        evolveInfo = 'Trade';
      }
    } else if (method === 'shed') {
      evolveInfo = 'Shed (with empty slot)';
    } else if (method === 'spin') {
      evolveInfo = 'Spin in circle';
    } else if (method === 'tower-of-darkness') {
      evolveInfo = 'Tower of Darkness';
    } else if (method === 'tower-of-waters') {
      evolveInfo = 'Tower of Waters';
    } else if (method === 'three-critical-hits') {
      evolveInfo = 'Get 3 crit hits';
    } else if (method === 'take-damage') {
      evolveInfo = 'Take damage (empty slot)';
    } else if (method === 'other') {
      if (details.min_level) {
        evolveInfo = `Level ${details.min_level}`;
      } else if (heldItem) {
        evolveInfo = `${heldItem.replace(/-/g, ' ')} held`;
      } else {
        evolveInfo = 'Special';
      }
    } else {
      evolveInfo = method.replace(/-/g, ' ');
    }
  }
  
  const current = [{ name: chain.species.name, level, evolveInfo }];
  if (chain.evolves_to && chain.evolves_to.length) {
    let result = [];
    chain.evolves_to.forEach(c => {
      const subs = collectEvolutionChains(c);
      subs.forEach(sub => {
        result.push(current.concat(sub));
      });
    });
    return result;
  } else {
    return [current];
  }
}

function renderEvolutionChains(chains) {
  // dedupe identical sequences
  const seen = new Set();
  const unique = chains.filter(seq => {
    const key = seq.map(s => `${s.name}@${s.level}`).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'evolution-chains';
  unique.forEach(seq => {
    const div = document.createElement('div');
    div.style.marginTop = '8px';
    seq.forEach((stage, idx) => {
      const cleanName = stage.name.replace(/\[|\]/g, '');
      const cleanLevel = (stage.level||'').toString().replace(/\[|\]/g, '');
      
      // Create clickable link for each Pokemon in the chain
      const link = document.createElement('a');
      link.href = '#';
      link.onclick = (e) => {
        e.preventDefault();
        lookup(cleanName);
      };
      link.style.color = '#8bac0f';
      link.style.cursor = 'pointer';
      link.textContent = cleanLevel ? `${cleanName} (Lvl ${cleanLevel})` : cleanName;
      div.appendChild(link);
      
      if (idx < seq.length - 1) {
        const arrow = document.createElement('span');
        arrow.textContent = ' → ';
        div.appendChild(arrow);
      }
    });
    wrapper.appendChild(div);
  });
  return wrapper;
}

// only include generation 1–3 version groups for moves
const GEN1_3_GROUPS = new Set([
  'red-blue','yellow',          // gen1
  'gold-silver','crystal',      // gen2
  'ruby-sapphire','emerald','firered-leafgreen' // gen3
]);

const GBA_GROUPS = new Set(['ruby-sapphire', 'emerald', 'firered-leafgreen']);
const GBA_VERSION_ORDER = ['firered-leafgreen', 'ruby-sapphire', 'emerald'];

function toGbaVersionKey(versionName) {
  if (!versionName) return null;
  const key = versionName.toLowerCase();
  if (key === 'firered' || key === 'leafgreen' || key === 'firered-leafgreen') return 'firered-leafgreen';
  if (key === 'ruby' || key === 'sapphire' || key === 'ruby-sapphire') return 'ruby-sapphire';
  if (key === 'emerald') return 'emerald';
  return null;
}

const VERSION_GROUP_NAMES = {
  'red-blue': 'Red/Blue',
  'yellow': 'Yellow',
  'gold-silver': 'Gold/Silver',
  'crystal': 'Crystal',
  'ruby-sapphire': 'Ruby/Sapphire',
  'emerald': 'Emerald',
  'firered-leafgreen': 'FireRed/LeafGreen'
};

const TYPE_COLORS = {
  'normal': { bg: '#a8a878', text: '#fff' },
  'fire': { bg: '#f08030', text: '#fff' },
  'water': { bg: '#6890f0', text: '#fff' },
  'grass': { bg: '#78c850', text: '#fff' },
  'electric': { bg: '#f8d030', text: '#000' },
  'ice': { bg: '#98d8d8', text: '#000' },
  'fighting': { bg: '#c03028', text: '#fff' },
  'poison': { bg: '#a040a0', text: '#fff' },
  'ground': { bg: '#e0c068', text: '#000' },
  'flying': { bg: '#a890f0', text: '#fff' },
  'psychic': { bg: '#f85888', text: '#fff' },
  'bug': { bg: '#a8b820', text: '#fff' },
  'rock': { bg: '#b8a038', text: '#fff' },
  'ghost': { bg: '#705898', text: '#fff' },
  'dragon': { bg: '#7038f8', text: '#fff' },
  'dark': { bg: '#705848', text: '#fff' },
  'steel': { bg: '#b8b8d0', text: '#000' },
  'fairy': { bg: '#ee99ac', text: '#000' }
};

async function buildEvolutionTabs(names, chains = [], spriteImg = null, selectedName = '', gbaVersionStore = createGbaVersionStore()) {
  const out = document.getElementById('output');
  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'tabs';
  const contentDiv = document.createElement('div');
  contentDiv.className = 'tab-content';

  // fetch data for all names in parallel
  const datas = await Promise.all(names.map(async name => {
    try {
      return await (await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`)).json();
    } catch (e) {
      return null;
    }
  }));

  // Create a map of name -> {level, evolveInfo} for easier lookup
  const nameToInfo = {};
  chains.forEach(chain => {
    chain.forEach((stage, idx) => {
      const evolveInfo = (idx > 0 && stage.evolveInfo) ? stage.evolveInfo : '';
      nameToInfo[stage.name] = { level: stage.level, evolveInfo };
    });
  });

  names.forEach((name, idx) => {
    const btn = document.createElement('button');
    const info = nameToInfo[name] || {};
    const levelText = info.level ? ` Lvl ${info.level}` : '';
    btn.textContent = name + levelText;
    btn.className = 'tab-btn';
    btn.addEventListener('click', () => showTab(idx));
    tabsDiv.appendChild(btn);

    // Add evolution method between tabs
    if (idx < names.length - 1 && nameToInfo[names[idx + 1]]?.evolveInfo) {
      const evolutionLabel = document.createElement('div');
      evolutionLabel.style.display = 'inline-block';
      evolutionLabel.style.padding = '4px 8px';
      evolutionLabel.style.fontSize = '9px';
      evolutionLabel.style.color = '#8bac0f';
      evolutionLabel.textContent = '→ ' + nameToInfo[names[idx + 1]].evolveInfo + ' →';
      tabsDiv.appendChild(evolutionLabel);
    }
  });

  out.appendChild(tabsDiv);
  out.appendChild(contentDiv);

  let isShiny = false;
  const gbaSyncCleanups = [];

  function updateSprite(data) {
    if (spriteImg && data) {
      const spriteUrl = isShiny
        ? (data.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_shiny 
          || data.sprites?.versions?.['generation-v']?.['black-white']?.front_shiny
          || data.sprites?.other?.['official-artwork']?.front_shiny
          || data.sprites?.front_shiny)
        : (data.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default 
          || data.sprites?.versions?.['generation-v']?.['black-white']?.front_default
          || data.sprites?.other?.['official-artwork']?.front_default
          || data.sprites?.front_default);
      if (spriteUrl) {
        spriteImg.src = spriteUrl;
      }
    }
  }

  async function showTab(i) {
    while (gbaSyncCleanups.length) {
      const cleanup = gbaSyncCleanups.pop();
      if (typeof cleanup === 'function') cleanup();
    }

    // clear existing content
    contentDiv.innerHTML = '';
    const data = datas[i];
    if (!data) {
      contentDiv.textContent = 'data unavailable';
      return;
    }
    
    // Add shiny toggle button
    const spriteControlDiv = document.createElement('div');
    spriteControlDiv.style.marginBottom = '8px';
    spriteControlDiv.style.display = 'flex';
    spriteControlDiv.style.gap = '4px';
    spriteControlDiv.style.alignItems = 'center';
    
    const shinyToggle = document.createElement('button');
    shinyToggle.textContent = isShiny ? '✦ Shiny' : '✧ Normal';
    shinyToggle.style.padding = '4px 8px';
    shinyToggle.style.fontSize = '9px';
    shinyToggle.style.background = isShiny ? '#f8d030' : '#8bac0f';
    shinyToggle.style.color = isShiny ? '#000' : '#0f380f';
    shinyToggle.style.border = '1px solid #666';
    shinyToggle.style.borderRadius = '4px';
    shinyToggle.style.cursor = 'pointer';
    shinyToggle.style.width = 'auto';
    shinyToggle.style.padding = '4px 12px';
    shinyToggle.onclick = (e) => {
      e.preventDefault();
      isShiny = !isShiny;
      shinyToggle.textContent = isShiny ? '✦ Shiny' : '✧ Normal';
      shinyToggle.style.background = isShiny ? '#f8d030' : '#8bac0f';
      shinyToggle.style.color = isShiny ? '#000' : '#0f380f';
      updateSprite(data);
    };
    spriteControlDiv.appendChild(shinyToggle);
    contentDiv.appendChild(spriteControlDiv);
    
    // Update the top sprite element
    updateSprite(data);
    
    // Types
    if (data.types && data.types.length > 0) {
      const typesDiv = document.createElement('div');
      typesDiv.style.marginBottom = '12px';
      const typesLabel = document.createElement('strong');
      typesLabel.textContent = 'Type:';
      typesDiv.appendChild(typesLabel);
      const typesList = document.createElement('div');
      typesList.style.marginTop = '4px';
      data.types.forEach((t, idx) => {
        const typeTag = document.createElement('span');
        typeTag.textContent = t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1);
        const colors = TYPE_COLORS[t.type.name] || { bg: '#6b8c6b', text: '#fff' };
        typeTag.style.display = 'inline-block';
        typeTag.style.padding = '4px 8px';
        typeTag.style.background = colors.bg;
        typeTag.style.color = colors.text;
        typeTag.style.borderRadius = '4px';
        typeTag.style.fontSize = '10px';
        typeTag.style.marginRight = idx < data.types.length - 1 ? '6px' : '0';
        typesList.appendChild(typeTag);
      });
      typesDiv.appendChild(typesList);
      contentDiv.appendChild(typesDiv);
    }
    
    const statDiv = document.createElement('div');
    statDiv.innerHTML = '<strong>Stats:</strong>';
    const ul = document.createElement('ul');
    let totalStats = 0;
    data.stats.forEach(s => {
      const li = document.createElement('li');
      li.textContent = `${s.stat.name}: ${s.base_stat}`;
      ul.appendChild(li);
      totalStats += s.base_stat;
    });
    statDiv.appendChild(ul);
    
    const totalDiv = document.createElement('div');
    totalDiv.style.marginTop = '4px';
    totalDiv.style.paddingTop = '8px';
    totalDiv.style.borderTop = '1px solid #6b8c6b';
    totalDiv.textContent = `Total: ${totalStats}`;
    totalDiv.style.fontSize = '11px';
    totalDiv.style.fontWeight = 'bold';
    statDiv.appendChild(totalDiv);
    
    contentDiv.appendChild(statDiv);

    // Held items (synced to selected GBA game)
    const heldItemsByVersion = {};
    if (data.held_items && data.held_items.length > 0) {
      data.held_items.forEach(item => {
        item.version_details.forEach(vd => {
          if (vd.rarity > 0) {
            const versionName = toGbaVersionKey(vd.version?.name);
            if (!versionName) return;
            if (!heldItemsByVersion[versionName]) {
              heldItemsByVersion[versionName] = {};
            }
            const current = heldItemsByVersion[versionName][item.item.name] || 0;
            heldItemsByVersion[versionName][item.item.name] = Math.max(current, vd.rarity);
          }
        });
      });
    }

    if (Object.keys(heldItemsByVersion).length > 0) {
      const itemDiv = document.createElement('div');
      itemDiv.innerHTML = '<strong>Held Items:</strong>';
      itemDiv.style.marginTop = '12px';

      const itemLabel = document.createElement('div');
      itemLabel.style.fontSize = '11px';
      itemLabel.style.color = '#aaa';
      itemLabel.style.marginTop = '4px';
      itemDiv.appendChild(itemLabel);

      const itemList = document.createElement('ul');
      itemList.style.marginTop = '6px';
      itemDiv.appendChild(itemList);

      const renderHeldItems = (selectedVersion) => {
        itemList.innerHTML = '';
        itemLabel.textContent = VERSION_GROUP_NAMES[selectedVersion] || selectedVersion;

        const itemMap = heldItemsByVersion[selectedVersion] || {};
        const rows = Object.entries(itemMap)
          .map(([name, rarity]) => ({ name, rarity }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!rows.length) {
          const li = document.createElement('li');
          li.textContent = 'No held items for this game.';
          itemList.appendChild(li);
          return;
        }

        rows.forEach(row => {
          const li = document.createElement('li');
          li.textContent = `${row.name} (${row.rarity}%)`;
          itemList.appendChild(li);
        });
      };

      const unsubscribeHeldSync = gbaVersionStore.subscribe(selectedVersion => {
        renderHeldItems(selectedVersion);
      });
      gbaSyncCleanups.push(unsubscribeHeldSync);

      renderHeldItems(gbaVersionStore.get());
      contentDiv.appendChild(itemDiv);
    }

    // level up moves (filtered to gen1-3)
    const movesByLevelByVersion = {};
    data.moves.forEach(m => {
      m.version_group_details.forEach(d => {
        if (
          d.move_learn_method.name === 'level-up' &&
          GEN1_3_GROUPS.has(d.version_group.name) &&
          d.level_learned_at > 0
        ) {
          const versionGroup = d.version_group.name;
          const lvl = d.level_learned_at;
          
          if (!movesByLevelByVersion[versionGroup]) {
            movesByLevelByVersion[versionGroup] = {};
          }
          if (!movesByLevelByVersion[versionGroup][lvl]) {
            movesByLevelByVersion[versionGroup][lvl] = new Set();
          }
          movesByLevelByVersion[versionGroup][lvl].add(m.move.name);
        }
      });
    });
    
    if (Object.keys(movesByLevelByVersion).length > 0) {
      const sortedVersions = GBA_VERSION_ORDER.filter(v => movesByLevelByVersion[v] && GBA_GROUPS.has(v));

      if (sortedVersions.length > 0) {
        const lm = document.createElement('div');
        lm.innerHTML = '<strong>Level-up moves:</strong>';
        lm.style.marginTop = '12px';

        const versionTabs = document.createElement('div');
        versionTabs.style.display = 'flex';
        versionTabs.style.flexDirection = 'column';
        versionTabs.style.gap = '4px';
        versionTabs.style.marginTop = '12px';
        versionTabs.style.marginBottom = '12px';
        versionTabs.style.minWidth = '150px';

        const versionContents = document.createElement('div');
        versionContents.style.width = '100%';

        const buttonByVersion = {};
        const contentByVersion = {};

        sortedVersions.forEach(versionGroup => {
          const btn = document.createElement('button');
          btn.textContent = VERSION_GROUP_NAMES[versionGroup] || versionGroup;
          btn.style.width = '100%';
          btn.style.padding = '8px 12px';
          btn.style.fontSize = '12px';
          btn.style.cursor = 'pointer';
          btn.style.background = '#333';
          btn.style.color = '#fff';
          btn.style.border = '1px solid #666';
          btn.style.borderRadius = '4px';
          btn.style.textAlign = 'left';
          btn.style.transition = 'all 0.1s';

          buttonByVersion[versionGroup] = btn;
          versionTabs.appendChild(btn);

          const versionDiv = document.createElement('div');
          versionDiv.style.display = 'none';

          const ulm = document.createElement('ul');
          const levels = Object.keys(movesByLevelByVersion[versionGroup]).map(Number).sort((a, b) => a - b);
          for (const lvl of levels) {
            const moveNames = Array.from(movesByLevelByVersion[versionGroup][lvl]).sort().map(n => n.replace(/\[|\]/g, ''));
            for (const moveName of moveNames) {
              const li = document.createElement('li');
              li.textContent = `Lvl ${lvl}: ${moveName}`;
              ulm.appendChild(li);
            }
          }

          versionDiv.appendChild(ulm);
          versionContents.appendChild(versionDiv);
          contentByVersion[versionGroup] = versionDiv;
        });

        const setActiveVersion = (versionGroup, updateStore = true) => {
          if (!contentByVersion[versionGroup]) return;

          sortedVersions.forEach(version => {
            contentByVersion[version].style.display = version === versionGroup ? 'block' : 'none';
            buttonByVersion[version].style.background = version === versionGroup ? '#8bac0f' : '#333';
          });

          if (updateStore) {
            gbaVersionStore.set(versionGroup);
          }
        };

        sortedVersions.forEach(versionGroup => {
          buttonByVersion[versionGroup].addEventListener('click', () => setActiveVersion(versionGroup));
        });

        const unsubscribeMovesSync = gbaVersionStore.subscribe(selectedVersion => {
          if (contentByVersion[selectedVersion]) {
            setActiveVersion(selectedVersion, false);
          }
        });
        gbaSyncCleanups.push(unsubscribeMovesSync);

        const preferredVersion = sortedVersions.includes(gbaVersionStore.get())
          ? gbaVersionStore.get()
          : sortedVersions[0];

        setActiveVersion(preferredVersion, false);
        if (preferredVersion !== gbaVersionStore.get()) {
          gbaVersionStore.set(preferredVersion);
        }

        lm.appendChild(versionTabs);
        lm.appendChild(versionContents);
        contentDiv.appendChild(lm);
      }
    }

    // egg moves dropdown with comprehensive breeding chains
    const eggMovesByVersion = {
      'firered-leafgreen': new Set(),
      'ruby-sapphire': new Set(),
      'emerald': new Set()
    };
    data.moves.forEach(m => {
      m.version_group_details.forEach(d => {
        if (d.move_learn_method.name === 'egg' && GBA_GROUPS.has(d.version_group.name)) {
          const versionKey = toGbaVersionKey(d.version_group.name);
          if (versionKey) {
            eggMovesByVersion[versionKey].add(m.move.name);
          }
        }
      });
    });

    const eggMoves = Array.from(
      new Set([
        ...Array.from(eggMovesByVersion['firered-leafgreen']),
        ...Array.from(eggMovesByVersion['ruby-sapphire']),
        ...Array.from(eggMovesByVersion['emerald'])
      ])
    );
    const eggDiv = document.createElement('div');
    const detailsEl = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = 'Egg moves';
    detailsEl.appendChild(sum);
    const ulEgg = document.createElement('ul');

    if (eggMoves.length) {
      let breedChainsMap = {};
      try {
        const currentSpeciesUrl = `https://pokeapi.co/api/v2/pokemon-species/${data.name}`;
        const speciesResp = await fetch(currentSpeciesUrl);
        if (speciesResp.ok) {
          const speciesData = await speciesResp.json();
          const eggGroups = speciesData.egg_groups?.map(g => g.name) || [];

          if (eggGroups.length > 0) {
            const pokemonInGroups = new Set();
            for (const group of eggGroups) {
              try {
                const groupResp = await fetch(`https://pokeapi.co/api/v2/egg-group/${group}`);
                if (groupResp.ok) {
                  const groupData = await groupResp.json();
                  for (const poke of groupData.pokemon_species) {
                    pokemonInGroups.add(poke.name);
                  }
                }
              } catch (_) {}
            }

            pokemonInGroups.delete(data.name);
            for (const name of names) {
              pokemonInGroups.delete(name);
            }

            if (pokemonInGroups.size > 0) {
              breedChainsMap = {};

              for (const mv of eggMoves) {
                const breedSources = [];

                for (const otherPoke of pokemonInGroups) {
                  try {
                    const otherResp = await fetch(`https://pokeapi.co/api/v2/pokemon/${otherPoke}`);
                    if (otherResp.ok) {
                      const otherData = await otherResp.json();
                      const canLearn = otherData.moves.some(m => 
                        m.move.name === mv &&
                        m.version_group_details.some(d =>
                          (d.move_learn_method.name === 'level-up' || 
                           d.move_learn_method.name === 'egg') &&
                          GBA_GROUPS.has(d.version_group.name)
                        )
                      );

                      if (canLearn) {
                        breedSources.push(otherPoke);
                      }
                    }
                  } catch (_) {}
                }

                if (breedSources.length > 0) {
                  breedChainsMap[mv] = breedSources;
                }
              }
            }
          }
        }
      } catch (_) {}

      const renderEggMoves = async (selectedVersion) => {
        ulEgg.innerHTML = '';
        sum.textContent = `Egg moves (${VERSION_GROUP_NAMES[selectedVersion] || selectedVersion})`;

        const versionMoves = Array.from(eggMovesByVersion[selectedVersion] || []).sort();
        if (!versionMoves.length) {
          const li = document.createElement('li');
          li.textContent = '(no egg moves for this game)';
          li.style.fontSize = '10px';
          li.style.color = '#888';
          ulEgg.appendChild(li);
          return;
        }

        for (const mv of versionMoves) {
          const li = document.createElement('li');
          li.style.marginBottom = '12px';

          const moveLabel = document.createElement('div');
          moveLabel.style.marginBottom = '4px';
          moveLabel.style.fontSize = '12px';
          moveLabel.style.color = '#aaa';
          moveLabel.textContent = mv + ':';
          li.appendChild(moveLabel);

          const sources = breedChainsMap[mv] || [];
          if (sources.length > 0) {
            const sourcesWrap = document.createElement('div');
            sourcesWrap.style.display = 'flex';
            sourcesWrap.style.flexWrap = 'wrap';
            sourcesWrap.style.gap = '6px';

            for (const source of sources.slice(0, 4)) {
              const sourceWrap = document.createElement('span');
              sourceWrap.style.display = 'inline-flex';
              sourceWrap.style.alignItems = 'center';
              sourceWrap.style.gap = '4px';

              try {
                const spriteResp = await fetch(`https://pokeapi.co/api/v2/pokemon/${source}`);
                if (spriteResp.ok) {
                  const spriteData = await spriteResp.json();
                  const spriteUrl = spriteData.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default
                    || spriteData.sprites?.versions?.['generation-v']?.['black-white']?.front_default
                    || spriteData.sprites?.front_default;
                  if (spriteUrl) {
                    const img = document.createElement('img');
                    img.src = spriteUrl;
                    img.style.width = '32px';
                    img.style.height = '32px';
                    img.style.imageRendering = 'pixelated';
                    img.title = source;
                    sourceWrap.appendChild(img);
                  }
                }
              } catch (_) {}

              const sourceSpan = document.createElement('span');
              sourceSpan.textContent = source;
              sourceSpan.style.fontSize = '10px';
              sourceWrap.appendChild(sourceSpan);
              sourcesWrap.appendChild(sourceWrap);
            }

            if (sources.length > 4) {
              const more = document.createElement('span');
              more.textContent = `+${sources.length - 4}`;
              more.style.fontSize = '10px';
              more.style.color = '#8bac0f';
              sourcesWrap.appendChild(more);
            }

            li.appendChild(sourcesWrap);
          } else {
            const none = document.createElement('span');
            none.textContent = '(no egg-group sources found)';
            none.style.fontSize = '10px';
            none.style.color = '#888';
            li.appendChild(none);
          }

          ulEgg.appendChild(li);
        }
      };

      const unsubscribeEggSync = gbaVersionStore.subscribe(selectedVersion => {
        renderEggMoves(selectedVersion);
      });
      gbaSyncCleanups.push(unsubscribeEggSync);

      await renderEggMoves(gbaVersionStore.get());

      detailsEl.appendChild(ulEgg);
    } else {
      sum.textContent = '';
      sum.appendChild(document.createTextNode('Egg moves (none) '));
      const icon = document.createElement('span');
      icon.textContent = '!';
      icon.style.color = '#8bac0f';
      sum.appendChild(icon);
      detailsEl.open = true;
      detailsEl.style.background = 'rgba(139, 172, 15, 0.12)';
      detailsEl.style.border = '1px solid #6b8c6b';
      detailsEl.style.borderRadius = '4px';
      detailsEl.style.padding = '6px';
      const li = document.createElement('li');
      li.textContent = '(no egg moves in gen 1-3)';
      li.style.fontSize = '10px';
      li.style.color = '#888';
      ulEgg.appendChild(li);
      detailsEl.appendChild(ulEgg);
    }

    eggDiv.appendChild(detailsEl);
    contentDiv.appendChild(eggDiv);
  }

  const normalizedSelected = (selectedName || '').toLowerCase();
  const selectedIdx = names.findIndex(n => n.toLowerCase() === normalizedSelected);
  showTab(selectedIdx >= 0 ? selectedIdx : 0);
}

function renderEvolution(chain) {
  // recursively walk and build a string
  let txt = chain.species.name;
  if (chain.evolves_to && chain.evolves_to.length) {
    txt += ' → ' + chain.evolves_to.map(c => renderEvolution(c)).join(' / ');
  }
  return txt;
}

document.getElementById('go').addEventListener('click', () => {
  const name = document.getElementById('search').value.trim().toLowerCase();
  if (name) lookup(name);
});

document.getElementById('search').addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    const name = document.getElementById('search').value.trim().toLowerCase();
    if (name) lookup(name);
  }
});

// predictive search data and custom dropdown
let allNames = [];
let history = JSON.parse(localStorage.getItem('searchHistory')||'[]');
let selectedIndex = -1;

async function loadNames(gen='all') {
  try {
    console.log('Loading names for gen:', gen);
    if (gen === 'all') {
      const promises = [1,2,3].map(g =>
        fetch(`${BACKEND}/pokemon-names?gen=${g}`).then(r => {
          console.log(`Gen ${g} response status:`, r.status);
          return r.ok ? r.json() : [];
        }).catch(e => {
          console.error(`Error fetching gen ${g}:`, e);
          return [];
        })
      );
      const arrays = await Promise.all(promises);
      allNames = [].concat(...arrays);
      console.log('Total names loaded:', allNames.length);
    } else {
      const url = `${BACKEND}/pokemon-names${gen && gen!=='all' ? '?gen='+gen : ''}`;
      console.log('Fetching from URL:', url);
      const res = await fetch(url);
      console.log('Response status:', res.status);
      if (res.ok) {
        allNames = await res.json();
        console.log('Names loaded:', allNames.length);
      } else {
        console.error('Failed to fetch pokemon names:', res.status);
      }
    }
    refreshSuggestions();
  } catch (e) {
    console.error('Error loading names:', e);
  }
}
function refreshSuggestions() {
  const input = document.getElementById('search');
  const sugg = document.getElementById('suggestions');
  const val = input.value.toLowerCase();
  const candidates = [];
  if (val) {
    // history first
    history.forEach(h => { if (h.startsWith(val)) candidates.push(h); });
    allNames.forEach(n => { if (n.startsWith(val) && !candidates.includes(n)) candidates.push(n); });
  }
  renderSuggestionList(candidates);
}

function renderSuggestionList(list) {
  const sugg = document.getElementById('suggestions');
  sugg.innerHTML = '';
  if (!list.length) return;
  const ul = document.createElement('ul');
  list.forEach((item,i) => {
    const li = document.createElement('li');
    li.textContent = item;
    li.addEventListener('click', () => {
      document.getElementById('search').value = item;
      lookup(item);
    });
    if (i === selectedIndex) li.classList.add('active');
    ul.appendChild(li);
  });
  sugg.appendChild(ul);
}

function clearSuggestions() {
  selectedIndex = -1;
  const sugg = document.getElementById('suggestions');
  sugg.innerHTML = '';
}

function addHistory(name) {
  history = history.filter(h=>h!==name);
  history.unshift(name);
  if (history.length>20) history.pop();
  localStorage.setItem('searchHistory', JSON.stringify(history));
}

// wire up events
const searchInput = document.getElementById('search');
searchInput.addEventListener('input', refreshSuggestions);
searchInput.addEventListener('keydown', e => {
  const sugg = document.getElementById('suggestions');
  const items = sugg.querySelectorAll('li');
  if (items.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      renderSuggestionList(Array.from(items).map(li=>li.textContent));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      renderSuggestionList(Array.from(items).map(li=>li.textContent));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && items[selectedIndex]) {
        e.preventDefault();
        const val = items[selectedIndex].textContent;
        searchInput.value = val;
        lookup(val);
      }
    }
  }
});

// generation selector
const genSelect = document.getElementById('gen-select');
genSelect.addEventListener('change', () => loadNames(genSelect.value));

// initial load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded: loading pokemon names...');
  await loadNames();

  const params = new URLSearchParams(window.location.search);
  const requestedPokemon = (params.get('pokemon') || 'bulbasaur').trim().toLowerCase();
  const initialPokemon = requestedPokemon || 'bulbasaur';

  const searchInputEl = document.getElementById('search');
  searchInputEl.value = initialPokemon;
  lookup(initialPokemon);
});