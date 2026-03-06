document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/index.html';
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`
    };

    const statusEl = document.getElementById('status');
    const metricsContainer = document.getElementById('metrics-container');

    // API Fetch wrapper with same-origin + dual-port fallback
    async function apiFetch(endpoint, options = {}) {
        const bases = [
            `${window.location.origin}/api`,
            `https://cdk-launchpad.onrender.com/api`,
            `http://localhost:5000/api`,
        ];

        for (let i = 0; i < bases.length; i++) {
            const base = bases[i];
            try {
                const url = `${base}${endpoint}`;
                const response = await fetch(url, {
                    ...options,
                    headers: { ...headers, ...options.headers }
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                if (i === bases.length - 1) {
                    throw error;
                }
            }
        }
    }

    // Expose for global helper functions defined below
    window.adminApiFetch = apiFetch;

    function fetchMetrics() {
        apiFetch('/admin/metrics')
            .then(data => {
                if (data.error) {
                    statusEl.textContent = data.error;
                    return;
                }
                metricsContainer.classList.remove('hidden');
                document.getElementById('metric-totalUsers').textContent = data.totalUsers;
                document.getElementById('metric-totalCoinsDistributed').textContent = data.totalCoinsDistributed;
                document.getElementById('metric-totalTokensLaunched').textContent = data.totalTokensLaunched;
                document.getElementById('metric-totalReferrals').textContent = data.totalReferrals;
                // ads today will be filled by fetchAdAnalytics below
            })
            .catch(err => {
                statusEl.textContent = 'Failed to fetch metrics: ' + (err.message || err);
                console.error(err);
            });
    }

    function fetchUsers() {
        apiFetch('/admin/users')
            .then(data => {
                if (data.error) {
                    statusEl.textContent = data.error;
                    return;
                }
                const userTable = document.getElementById('user-management-table');
                userTable.innerHTML = '';
                data.forEach(user => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="p-2">${user.id}</td>
                        <td class="p-2">${user.email}</td>
                        <td class="p-2">${user.coins || 0}</td>
                        <td class="p-2">${user.referrals}</td>
                        <td class="p-2">${user.is_admin ? 'Yes' : 'No'}</td>
                        <td class="p-2">
                            <button class="text-xs bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded" onclick="toggleAdmin('${user.id}', ${user.is_admin})">${user.is_admin ? 'Remove Admin' : 'Make Admin'}</button>
                            <button class="text-xs bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded" onclick="banUser('${user.id}')">Ban</button>
                        </td>
                        <td class="p-2">${new Date(user.created_at).toLocaleDateString()}</td>
                    `;
                    userTable.appendChild(row);
                });
            })
            .catch(err => {
                statusEl.textContent = 'Failed to fetch users.';
                console.error(err);
            });
    }

    function fetchTokens() {
        apiFetch('/admin/tokens')
            .then(data => {
                if (data.error) {
                    statusEl.textContent = data.error;
                    return;
                }
                const tokenTable = document.getElementById('token-launch-table');
                tokenTable.innerHTML = '';
                data.forEach(token => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="p-2">${token.token_name}</td>
                        <td class="p-2">${token.token_symbol}</td>
                        <td class="p-2">${token.creator}</td>
                        <td class="p-2">${new Date(token.launch_date).toLocaleDateString()}</td>
                        <td class="p-2">${token.contract_address}</td>
                        <td class="p-2">
                            <button class="text-xs bg-green-500 hover:bg-green-600 text-white py-1 px-2 rounded" onclick="toggleHighlight('${token.id}', ${token.is_highlighted})">${token.is_highlighted ? 'Remove Highlight' : 'Highlight'}</button>
                            <button class="text-xs bg-gray-500 hover:bg-gray-600 text-white py-1 px-2 rounded" onclick="toggleHide('${token.id}', ${token.is_hidden})">${token.is_hidden ? 'Show' : 'Hide'}</button>
                        </td>
                    `;
                    tokenTable.appendChild(row);
                });
            })
            .catch(err => {
                statusEl.textContent = 'Failed to fetch tokens: ' + (err.message || err);
                console.error(err);
            });
    }

    function fetchSettings() {
        apiFetch('/admin/settings')
            .then(data => {
                if (data.error) {
                    statusEl.textContent = data.error;
                    return;
                }
                document.getElementById('setting-daily-reward').value = data.daily_claim_reward || 0;
                document.getElementById('setting-ad-reward').value = data.ad_claim_reward || 0;
                document.getElementById('setting-referral-bonus').value = data.referrer_signup_bonus || 0;
                document.getElementById('setting-token-launch-fee').value = data.token_launch_fee || 0;
            })
            .catch(err => {
                statusEl.textContent = 'Failed to fetch settings: ' + (err.message || err);
                console.error(err);
            });
    }

    function fetchAdAnalytics() {
        apiFetch('/admin/ad-analytics')
            .then(data => {
                if (data.error) {
                    statusEl.textContent = data.error;
                    return;
                }
                // spec: adsToday and totalAds
                document.getElementById('ad-metric-today').textContent = data.adsToday;
                document.getElementById('ad-metric-total').textContent = data.totalAds;
                document.getElementById('ad-metric-revenue').textContent = `$${data.estimatedRevenue}`;
                // also populate metrics card for consistency
                const adsCard = document.getElementById('metric-adsWatchedToday');
                if (adsCard) adsCard.textContent = data.adsToday;
            })
            .catch(err => {
                statusEl.textContent = 'Failed to fetch ad analytics: ' + (err.message || err);
                console.error(err);
            });
    }


    fetchMetrics();
    fetchUsers();
    fetchTokens();
    fetchSettings();
    fetchAdAnalytics();

    document.getElementById('adjust-coins-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const userId = document.getElementById('adjust-coins-user-id').value;
        const amount = document.getElementById('adjust-coins-amount').value;
        
        adminApiFetch('/admin/adjust-coins', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount: parseInt(amount) })
        })
        .then(data => {
            if (data.error) {
                statusEl.textContent = data.error;
            } else {
                statusEl.textContent = 'Coins adjusted successfully.';
                fetchUsers();
            }
        })
        .catch(err => {
            statusEl.textContent = 'Failed to adjust coins.';
            console.error(err);
        });
    });

    document.getElementById('reward-settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const settings = {
            daily_claim_reward: document.getElementById('setting-daily-reward').value,
            ad_claim_reward: document.getElementById('setting-ad-reward').value,
            referrer_signup_bonus: document.getElementById('setting-referral-bonus').value,
            token_launch_fee: document.getElementById('setting-token-launch-fee').value,
        };

        adminApiFetch('/admin/settings', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        })
        .then(data => {
            if (data.error) {
                statusEl.textContent = data.error;
            } else {
                statusEl.textContent = 'Settings saved successfully.';
            }
        })
        .catch(err => {
            statusEl.textContent = 'Failed to save settings.';
            console.error(err);
        });
    });
});

function toggleAdmin(userId, isAdmin) {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    const endpoint = `/admin/users/${userId}/${isAdmin ? 'remove-admin' : 'make-admin'}`;
    if (window.adminApiFetch) {
        window.adminApiFetch(endpoint, { method: 'POST', headers })
            .then(() => location.reload())
            .catch(err => console.error('toggleAdmin error', err));
    }
}

function banUser(userId) {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    const endpoint = `/admin/users/${userId}/ban`;
    if (window.adminApiFetch) {
        window.adminApiFetch(endpoint, { method: 'POST', headers })
            .then(() => location.reload())
            .catch(err => console.error('banUser error', err));
    }
}

function toggleHighlight(tokenId, isHighlighted) {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    const endpoint = `/admin/tokens/${tokenId}/${isHighlighted ? 'remove-highlight' : 'highlight'}`;
    if (window.adminApiFetch) {
        window.adminApiFetch(endpoint, { method: 'POST', headers })
            .then(() => location.reload())
            .catch(err => console.error('toggleHighlight error', err));
    }
}

function toggleHide(tokenId, isHidden) {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    const endpoint = `/admin/tokens/${tokenId}/${isHidden ? 'show' : 'hide'}`;
    if (window.adminApiFetch) {
        window.adminApiFetch(endpoint, { method: 'POST', headers })
            .then(() => location.reload())
            .catch(err => console.error('toggleHide error', err));
    }
}
