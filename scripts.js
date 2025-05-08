const clientId = 'gky3gvnl2o5v2x26xrw5i79hs17nrk';
const accessToken = '8wq193puwfzavy6m63ltbi96pjfe6x'; // Must be valid Bearer token
const tableBody = document.querySelector('#streamers-table tbody');
const tableHeaders = document.querySelectorAll('#streamers-table th');
let streams = [];
let currentSort = { column: 'viewer_count', direction: 'desc' };

async function fetchWithRetry(url, options, retries = 3, backoff = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Ratelimit-Reset')) || backoff;
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP error: ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, backoff * (i + 1)));
    }
  }
}

async function fetchTopStreams() {
  try {
    const loadingSpinner = document.createElement('div');
    loadingSpinner.id = 'loading-spinner';
    loadingSpinner.innerHTML = 'Loading streams...';
    tableBody.parentNode.insertBefore(loadingSpinner, tableBody);
    loadingSpinner.style.display = 'block';
    tableBody.innerHTML = '';

    streams = [];

    let cursor = null;
    for (let i = 0; i < 5; i++) {
      const url = new URL('https://api.twitch.tv/helix/streams');
      url.searchParams.set('first', '100');
      if (cursor) url.searchParams.set('after', cursor);

      console.log(`Fetching streams page ${i + 1}`);
      const data = await fetchWithRetry(url.toString(), {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      streams.push(...data.data.map(stream => ({
        user_id: stream.user_id,
        user_name: stream.user_name,
        user_login: stream.user_login,
        viewer_count: stream.viewer_count,
        game_name: stream.game_name || 'Unknown',
        profile_image_url: null
      })));

      cursor = data.pagination.cursor;
      if (!cursor || streams.length >= 500) break;
    }

    const userLogins = streams.map(s => s.user_login);
    for (let i = 0; i < userLogins.length; i += 100) {
      const batch = userLogins.slice(i, i + 100);
      const url = new URL('https://api.twitch.tv/helix/users');
      batch.forEach(login => url.searchParams.append('login', login));
      console.log(`Fetching user profiles for batch ${i / 100 + 1}`);
      const data = await fetchWithRetry(url.toString(), {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      data.data.forEach(user => {
        const stream = streams.find(s => s.user_login === user.login);
        if (stream) stream.profile_image_url = user.profile_image_url;
      });
    }

    sortAndRender();

  } catch (error) {
    console.error('Error fetching streams:', error);
    tableBody.innerHTML = `<tr><td colspan="6">Error loading streams: ${error.message}</td></tr>`;
  } finally {
    const loadingSpinner = document.getElementById('loading-spinner');
    if (loadingSpinner) loadingSpinner.style.display = 'none';
  }
}

function sortAndRender() {
  const { column, direction } = currentSort;

  // Always rank by viewer_count descending
  const rankedStreams = [...streams].sort((a, b) => b.viewer_count - a.viewer_count);
  const rankMap = new Map();
  rankedStreams.forEach((s, i) => rankMap.set(s.user_login, i + 1));

  const sortedStreams = [...streams].sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    if (column === 'viewer_count' || column === 'user_id') {
      valA = Number(valA);
      valB = Number(valB);
      return direction === 'asc' ? valA - valB : valB - valA;
    }

    return direction === 'asc'
      ? valA.localeCompare(valB)
      : valB.localeCompare(valA);
  }).slice(0, 500);

  tableBody.innerHTML = '';
  sortedStreams.forEach((stream) => {
    const row = document.createElement('tr');
    const rank = rankMap.get(stream.user_login);
    row.innerHTML = `
      <td>${rank}</td>
      <td title="${stream.user_name}"><img class="profile-img" src="${stream.profile_image_url || 'default-profile.png'}" alt="${stream.user_name}"/> ${stream.user_name}</td>
      <td>${stream.user_id}</td>
      <td>${stream.viewer_count.toLocaleString()}</td>
      <td>${stream.game_name}</td>
      <td><a href="https://twitch.tv/${stream.user_login}" target="_blank">Visit Channel</a></td>
    `;
    tableBody.appendChild(row);
  });

  tableHeaders.forEach(header => {
    const arrow = header.querySelector('.sort-arrow');
    const sortColumn = header.getAttribute('data-sort');
    if (sortColumn === column) {
      arrow.textContent = direction === 'asc' ? '↑' : '↓';
    } else {
      arrow.textContent = '';
    }
  });
}

tableHeaders.forEach(header => {
  header.addEventListener('click', () => {
    const column = header.getAttribute('data-sort');
    if (currentSort.column === column) {
      currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      currentSort.column = column;
      currentSort.direction = column === 'viewer_count' ? 'desc' : 'asc';
    }
    sortAndRender();
  });
});

fetchTopStreams();
