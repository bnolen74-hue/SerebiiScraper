const BACKEND = 'http://localhost:3000'; // change if your API runs elsewhere

async function lookup(name) {
  const out = document.getElementById('output');
  out.textContent = 'Loading...';
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
    // fetch the Pokemon data (not species)
    let pokeData;
    try {
      pokeData = await (await fetch(entry.pokeapi_url.replace('pokemon-species', 'pokemon'))).json();
    } catch (_){ pokeData = null; }

    if (pokeData) {
      // sprite
      if (pokeData.sprites && pokeData.sprites.front_default) {
        const img = document.createElement('img');
        img.src = pokeData.sprites.front_default;
        img.style.maxWidth = '120px';
        out.appendChild(img);
      }
      // stats
      if (pokeData.stats) {
        const statDiv = document.createElement('div');
        statDiv.innerHTML = '<strong>Stats:</strong>';
        const ul = document.createElement('ul');
        pokeData.stats.forEach(s => {
          const li = document.createElement('li');
          li.textContent = `${s.stat.name}: ${s.base_stat}`;
          ul.appendChild(li);
        });
        statDiv.appendChild(ul);
        out.appendChild(statDiv);
      }
      // egg moves
      if (pokeData.moves) {
        const eggs = pokeData.moves.filter(m =>
          m.version_group_details.some(d => d.move_learn_method.name === 'egg')
        ).map(m => m.move.name);
        if (eggs.length) {
          const em = document.createElement('div');
          em.innerHTML = '<strong>Egg moves:</strong> ' + eggs.join(', ');
          out.appendChild(em);
        }
      }
    }

    // fetch species to get evolution chain
    try {
      const species = await (await fetch(entry.pokeapi_url)).json();
      if (species.evolution_chain && species.evolution_chain.url) {
        const evo = await (await fetch(species.evolution_chain.url)).json();
        const evoDiv = document.createElement('div');
        evoDiv.innerHTML = '<strong>Evolution:</strong> ';
        const evoList = document.createElement('span');
        evoList.textContent = renderEvolution(evo.chain);
        evoDiv.appendChild(evoList);
        out.appendChild(evoDiv);
      }
    } catch (_){ /* ignore */ }
  }
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