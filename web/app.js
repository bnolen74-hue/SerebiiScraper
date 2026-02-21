const BACKEND = 'http://localhost:3000'; // change if your API runs elsewhere

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

  if (entry.pokeapi_url) {
    // fetch the Pokemon data (not species), but we will also load chain members later
    let pokeData;
    try {
      pokeData = await (await fetch(entry.pokeapi_url.replace('pokemon-species', 'pokemon'))).json();
    } catch (_){ pokeData = null; }

    if (pokeData) {
      // sprite and stats are shown in the individual tab later; show just sprite for selected entry here
      if (pokeData.sprites && pokeData.sprites.front_default) {
        const img = document.createElement('img');
        img.src = pokeData.sprites.front_default;
        img.style.maxWidth = '120px';
        out.appendChild(img);
      }
    }

    // fetch species to get evolution chain and render the chain with levels
    try {
      const species = await (await fetch(entry.pokeapi_url)).json();
      if (species.evolution_chain && species.evolution_chain.url) {
        const evo = await (await fetch(species.evolution_chain.url)).json();
        let chains = collectEvolutionChains(evo.chain);
        
        // Filter chains to only include gen 1-3 Pokemon
        chains = await filterChainsToGen1to3(chains);
        
        // Get names from filtered chains only
        const names = [];
        chains.forEach(chain => {
          chain.forEach(stage => {
            if (!names.includes(stage.name)) {
              names.push(stage.name);
            }
          });
        });
        
        if (names.length) {
          // show tabs for individual details (stats, moves)
          await buildEvolutionTabs(names, chains);
        }
      }
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

async function buildEvolutionTabs(names, chains = []) {
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

  async function showTab(i) {
    // clear existing content
    contentDiv.innerHTML = '';
    const data = datas[i];
    if (!data) {
      contentDiv.textContent = 'data unavailable';
      return;
    }
    // sprite
    if (data.sprites && data.sprites.front_default) {
      const img = document.createElement('img');
      img.src = data.sprites.front_default;
      img.style.maxWidth = '120px';
      contentDiv.appendChild(img);
    }
    const statDiv = document.createElement('div');
    statDiv.innerHTML = '<strong>Stats:</strong>';
    const ul = document.createElement('ul');
    data.stats.forEach(s => {
      const li = document.createElement('li');
      li.textContent = `${s.stat.name}: ${s.base_stat}`;
      ul.appendChild(li);
    });
    statDiv.appendChild(ul);
    contentDiv.appendChild(statDiv);

    // level up moves (filtered to gen1-3)
    const movesByLevel = {};
    data.moves.forEach(m => {
      m.version_group_details.forEach(d => {
        if (
          d.move_learn_method.name === 'level-up' &&
          GEN1_3_GROUPS.has(d.version_group.name) &&
          d.level_learned_at > 0
        ) {
          const lvl = d.level_learned_at;
          movesByLevel[lvl] = movesByLevel[lvl] || new Set();
          movesByLevel[lvl].add(m.move.name);
        }
      });
    });
    const levels = Object.keys(movesByLevel).map(Number).sort((a,b)=>a-b);
    if (levels.length) {
      const lm = document.createElement('div');
      lm.innerHTML = '<strong>Level-up moves:</strong>';
      const ulm = document.createElement('ul');
      levels.forEach(lvl => {
        const names = Array.from(movesByLevel[lvl]).sort().map(n=>n.replace(/\[|\]/g,''));
        const li = document.createElement('li');
        li.textContent = `Lvl ${lvl}: ${names.join(', ')}`;
        ulm.appendChild(li);
      });
      lm.appendChild(ulm);
      contentDiv.appendChild(lm);
    }

    // egg moves dropdown with comprehensive breeding chains
    const eggMoves = data.moves.filter(m =>
      m.version_group_details.some(d =>
        d.move_learn_method.name === 'egg' &&
        GEN1_3_GROUPS.has(d.version_group.name)
      )
    ).map(m => m.move.name);
    if (eggMoves.length) {
      const eggDiv = document.createElement('div');
      const detailsEl = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = 'Egg moves';
      detailsEl.appendChild(sum);
      const ulEgg = document.createElement('ul');
      
      // fetch move info and pokemon sprites to build visual breeding chains
      await Promise.all(eggMoves.map(async mv => {
        try {
          const mi = await (await fetch(`https://pokeapi.co/api/v2/move/${mv}`)).json();
          const li = document.createElement('li');
          li.style.marginBottom = '8px';
          li.style.display = 'flex';
          li.style.alignItems = 'center';
          li.style.gap = '4px';
          
          // Add move name
          const moveName = document.createElement('span');
          moveName.textContent = mv + ': ';
          moveName.style.whiteSpace = 'nowrap';
          li.appendChild(moveName);
          
          // Create chain container
          const chainContainer = document.createElement('div');
          chainContainer.style.display = 'flex';
          chainContainer.style.alignItems = 'center';
          chainContainer.style.gap = '2px';
          chainContainer.style.flexWrap = 'wrap';
          
          // Find which Pokemon in names can naturally learn this move
          let sourceIdx = null;
          for (let j = 0; j < names.length; j++) {
            if (mi.learned_by_pokemon.some(p => p.name === names[j])) {
              sourceIdx = j;
              break;
            }
          }
          
          // Build chain with sprites
          if (sourceIdx !== null) {
            // Show chain from source to current Pokemon
            for (let j = sourceIdx; j < names.length; j++) {
              if (j > sourceIdx) {
                const arrow = document.createElement('span');
                arrow.textContent = '←';
                arrow.style.color = '#8bac0f';
                chainContainer.appendChild(arrow);
              }
              
              const pokeName = names[j];
              // Fetch and display sprite
              try {
                const spriteResp = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokeName}`);
                if (spriteResp.ok) {
                  const spriteData = await spriteResp.json();
                  const spriteUrl = spriteData.sprites?.front_default;
                  if (spriteUrl) {
                    const img = document.createElement('img');
                    img.src = spriteUrl;
                    img.style.width = '32px';
                    img.style.height = '32px';
                    img.style.imageRendering = 'pixelated';
                    img.title = pokeName;
                    chainContainer.appendChild(img);
                  }
                }
              } catch (_) {
                // Fallback to text if sprite fetch fails
                const text = document.createElement('span');
                text.textContent = pokeName;
                text.style.fontSize = '10px';
                chainContainer.appendChild(text);
              }
            }
          } else {
            // Source not in evolution chain, just show move name
            const text = document.createElement('span');
            text.textContent = '(external source)';
            text.style.fontSize = '10px';
            text.style.color = '#888';
            chainContainer.appendChild(text);
          }
          
          li.appendChild(chainContainer);
          ulEgg.appendChild(li);
        } catch (_e) {
          const li = document.createElement('li');
          li.textContent = mv;
          ulEgg.appendChild(li);
        }
      }));
      detailsEl.appendChild(ulEgg);
      eggDiv.appendChild(detailsEl);
      contentDiv.appendChild(eggDiv);
    }
  }

  if (names.length) showTab(0);
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
    if (gen === 'all') {
      // aggregate gens 1–3 only
      const promises = [1,2,3].map(g =>
        fetch(`${BACKEND}/pokemon-names?gen=${g}`).then(r => r.ok ? r.json() : [])
      );
      const arrays = await Promise.all(promises);
      allNames = [].concat(...arrays);
    } else {
      const url = `${BACKEND}/pokemon-names${gen && gen!=='all' ? '?gen='+gen : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        allNames = await res.json();
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
document.addEventListener('DOMContentLoaded', () => loadNames());