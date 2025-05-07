const clientId = 'gky3gvnl2o5v2x26xrw5i79hs17nrk';
const accessToken = '8wq193puwfzavy6m63ltbi96pjfe6x'; // Must be valid Bearer token
const tableBody = document.querySelector('#streams-table tbody');
const categoryDropdown = document.getElementById('category-dropdown');
const loadingSpinner = document.createElement('div');

// Simple in-memory cache
const cache = {
  userProfiles: new Map(),
};

// Add loading spinner
loadingSpinner.id = 'loading-spinner';
loadingSpinner.innerHTML = 'Loading streams...';
tableBody.parentNode.insertBefore(loadingSpinner, tableBody);

async function fetchTopCategories() {
  try {
    const url = new URL('https://api.twitch.tv/helix/games/top');
    url.searchParams.set('first', '100');

    const response = await fetch(url.toString(), {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const data = await response.json();
    populateCategoryDropdown(data.data);
  } catch (error) {
    console.error('Error fetching top categories:', error);
  }
}

function populateCategoryDropdown(categories) {
  categoryDropdown.innerHTML = '<option value="">-- Select a Category --</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categoryDropdown.appendChild(option);
  });
}

async function fetchLiveStreams(gameId = null) {
  try {
    loadingSpinner.style.display = 'block';
    tableBody.innerHTML = '';

    let url = new URL('https://api.twitch.tv/helix/streams');
    url.searchParams.set('first', '50'); // Optimized for speed
    if (gameId) {
      url.searchParams.set('game_id', gameId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const data = await response.json();
    if (data.data && data.data.length > 0) {
      populateTable(data.data);
    } else {
      tableBody.innerHTML = '<tr><td colspan="11">No live streams found for this category.</td></tr>';
    }
  } catch (error) {
    console.error('Error fetching live streams:', error);
    tableBody.innerHTML = '<tr><td colspan="11">Error loading streams.</td></tr>';
  } finally {
    loadingSpinner.style.display = 'none';
  }
}

async function fetchUserProfiles(userLogins) {
  try {
    // Check cache first
    const cachedProfiles = {};
    const uncachedLogins = userLogins.filter(login => {
      if (cache.userProfiles.has(login.toLowerCase())) {
        cachedProfiles[login.toLowerCase()] = cache.userProfiles.get(login.toLowerCase());
        return false;
      }
      return true;
    });

    if (uncachedLogins.length === 0) {
      return cachedProfiles;
    }

    if (!clientId || !accessToken) {
      console.warn('Skipping user profiles fetch due to missing credentials');
      return userLogins.reduce((acc, login) => ({
        ...acc,
        [login.toLowerCase()]: { profile_image_url: 'default-profile.png', broadcaster_type: 'Regular' }
      }), {});
    }

    const url = new URL('https://api.twitch.tv/helix/users');
    uncachedLogins.forEach(login => url.searchParams.append('login', login));

    const response = await fetch(url.toString(), {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const profiles = data.data.reduce((acc, user) => {
      const profile = {
        profile_image_url: user.profile_image_url,
        broadcaster_type: user.broadcaster_type || 'Regular'
      };
      acc[user.login.toLowerCase()] = profile;
      cache.userProfiles.set(user.login.toLowerCase(), profile); // Cache
      return acc;
    }, {});

    return { ...cachedProfiles, ...profiles };
  } catch (error) {
    console.error('Error fetching user profiles:', error);
    return userLogins.reduce((acc, login) => ({
      ...acc,
      [login.toLowerCase()]: { profile_image_url: 'default-profile.png', broadcaster_type: 'Regular' }
    }), {});
  }
}

async function fetchRecentVideos(userIds) {
  try {
    if (!userIds || userIds.length === 0) {
      console.error('No user IDs provided for videos');
      return {};
    }

    if (!clientId || !accessToken) {
      console.warn('Skipping video fetch due to missing credentials');
      return userIds.reduce((acc, id) => ({ ...acc, [id]: { title: 'N/A (No Credentials)', url: '#', duration: 'N/A' } }), {});
    }

    const videos = {};
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < userIds.length; i += batchSize) {
      batches.push(userIds.slice(i, i + batchSize));
    }

    for (const batchIds of batches) {
      await Promise.all(batchIds.map(async userId => {
        const url = new URL('https://api.twitch.tv/helix/videos');
        url.searchParams.set('user_id', userId);
        url.searchParams.set('first', '1');
        url.searchParams.set('type', 'archive');

        try {
          const response = await fetch(url.toString(), {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const data = await response.json();
          console.log(`Video response for userId ${userId}:`, data); // Debug log
          const video = data.data[0];
          videos[userId] = video ? { title: video.title, url: video.url, duration: video.duration } : { title: 'No Video', url: '#', duration: 'N/A' };
        } catch (error) {
          console.error(`Error fetching video for userId ${userId}:`, error);
          videos[userId] = { title: 'N/A', url: '#', duration: 'N/A' };
        }
      }));
    }

    return videos;
  } catch (error) {
    console.error('Error fetching videos:', error);
    return userIds.reduce((acc, id) => ({ ...acc, [id]: { title: 'N/A', url: '#', duration: 'N/A' } }), {});
  }
}

async function fetchTopClips(userIds) {
  try {
    if (!userIds || userIds.length === 0) {
      console.error('No user IDs provided for clips');
      return {};
    }

    if (!clientId || !accessToken) {
      console.warn('Skipping clip fetch due to missing credentials');
      return userIds.reduce((acc, id) => ({ ...acc, [id]: { title: 'N/A (No Credentials)', url: '#' } }), {});
    }

    const clips = {};
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < userIds.length; i += batchSize) {
      batches.push(userIds.slice(i, i + batchSize));
    }

    for (const batchIds of batches) {
      await Promise.all(batchIds.map(async userId => {
        const url = new URL('https://api.twitch.tv/helix/clips');
        url.searchParams.set('broadcaster_id', userId);
        url.searchParams.set('first', '1');

        try {
          const response = await fetch(url.toString(), {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const data = await response.json();
          console.log(`Clip response for userId ${userId}:`, data); // Debug log
          const clip = data.data[0];
          clips[userId] = clip ? { title: clip.title, url: clip.url } : { title: 'No Clip', url: '#' };
        } catch (error) {
          console.error(`Error fetching clip for userId ${userId}:`, error);
          clips[userId] = { title: 'N/A', url: '#' };
        }
      }));
    }

    return clips;
  } catch (error) {
    console.error('Error fetching clips:', error);
    return userIds.reduce((acc, id) => ({ ...acc, [id]: { title: 'N/A', url: '#' } }), {});
  }
}

async function fetchNextStreams(userIds) {
  try {
    if (!userIds || userIds.length === 0) {
      console.error('No user IDs provided for schedules');
      return {};
    }

    if (!clientId || !accessToken) {
      console.warn('Skipping schedule fetch due to missing credentials');
      return userIds.reduce((acc, id) => ({ ...acc, [id]: 'N/A (No Credentials)' }), {});
    }

    const schedules = {};
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < userIds.length; i += batchSize) {
      batches.push(userIds.slice(i, i + batchSize));
    }

    for (const batchIds of batches) {
      await Promise.all(batchIds.map(async userId => {
        const url = new URL('https://api.twitch.tv/helix/schedule');
        url.searchParams.set('broadcaster_id', userId);
        url.searchParams.set('first', '1');

        try {
          const response = await fetch(url.toString(), {
            headers: {
              'Client-ID': clientId,
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const data = await response.json();
          console.log(`Schedule response for userId ${userId}:`, data); // Debug log
          const nextSegment = data.data.segments?.[0];
          schedules[userId] = nextSegment ? new Date(nextSegment.start_time).toLocaleString() : 'No Schedule';
        } catch (error) {
          console.error(`Error fetching schedule for userId ${userId}:`, error);
          schedules[userId] = 'N/A';
        }
      }));
    }

    return schedules;
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return userIds.reduce((acc, id) => ({ ...acc, [id]: 'N/A' }), {});
  }
}

async function populateTable(streams) {
  const userLogins = streams.map(s => s.user_login);
  const userIds = streams.map(s => s.user_id);

  // Render initial table with basic data
  tableBody.innerHTML = '';
  const rows = new Map();
  streams.forEach(stream => {
    const row = document.createElement('tr');
    row.dataset.userId = stream.user_id;
    row.innerHTML = `
      <td><img class="profile-img" src="default-profile.png" alt="${stream.user_name}"/> ${stream.user_name}</td>
      <td>${stream.user_id}</td>
      <td>${stream.viewer_count}</td>
      <td>${stream.language}</td>
      <td>${stream.is_mature ? 'Yes' : 'No'}</td>
      <td>Loading...</td>
      <td>Loading...</td>
      <td>Loading...</td>
      <td>Loading...</td>
      <td>Loading...</td>
      <td><a href="https://twitch.tv/${stream.user_login}" target="_blank">Visit Channel</a></td>
    `;
    tableBody.appendChild(row);
    rows.set(stream.user_id, row);
  });

  // Fetch and update user profiles
  const userProfiles = await fetchUserProfiles(userLogins);
  streams.forEach(stream => {
    const row = rows.get(stream.user_id);
    const profileData = userProfiles[stream.user_login.toLowerCase()] || {};
    const profileImg = profileData.profile_image_url || 'default-profile.png';
    const broadcasterType = profileData.broadcaster_type || 'Regular';
    row.cells[0].innerHTML = `<img class="profile-img" src="${profileImg}" alt="${stream.user_name}"/> ${stream.user_name}`;
    row.cells[5].textContent = broadcasterType;
  });

  // Fetch and update videos
  const recentVideos = await fetchRecentVideos(userIds);
  streams.forEach(stream => {
    const row = rows.get(stream.user_id);
    const video = recentVideos[stream.user_id] || { title: 'N/A', url: '#', duration: 'N/A' };
    row.cells[6].innerHTML = `<a href="${video.url}" target="_blank">${video.title}</a>`;
    row.cells[7].textContent = video.duration;
  });

  // Fetch and update clips
  const topClips = await fetchTopClips(userIds);
  streams.forEach(stream => {
    const row = rows.get(stream.user_id);
    const clip = topClips[stream.user_id] || { title: 'N/A', url: '#' };
    row.cells[8].innerHTML = `<a href="${clip.url}" target="_blank">${clip.title}</a>`;
  });

  // Fetch and update schedules
  const nextStreams = await fetchNextStreams(userIds);
  streams.forEach(stream => {
    const row = rows.get(stream.user_id);
    row.cells[9].textContent = nextStreams[stream.user_id] || 'N/A';
  });

  loadingSpinner.style.display = 'none';
}

categoryDropdown.addEventListener('change', () => {
  const selectedCategoryId = categoryDropdown.value;
  if (selectedCategoryId) {
    fetchLiveStreams(selectedCategoryId);
  }
});

fetchTopCategories();