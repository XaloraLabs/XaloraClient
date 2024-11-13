const WebSocket = require('ws');
const axios = require('axios');

class PterodactylClientModule {
  constructor(apiUrl, apiKey) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.socket = null;
    this.token = null;
    this.serverId = null;
    this.eventHandlers = {};
  }

  async getServerDetails(serverId, includeEgg = false, includeSubusers = false) {
    try {
      const response = await axios.get(`${this.apiUrl}/api/client/servers/${serverId}`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        params: {
          include: [
            ...(includeEgg ? ['egg'] : []),
            ...(includeSubusers ? ['subusers'] : [])
          ].join(',')
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching server details:', error);
      throw error;
    }
  }

  async connectWebSocket(serverId) {
    try {
      const response = await axios.get(`${this.apiUrl}/api/client/servers/${serverId}/websocket`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      const { token, socket: socketUrl } = response.data.data;
      this.token = token;
      this.serverId = serverId;

      this.socket = new WebSocket(socketUrl);

      this.socket.on('open', () => {
        console.log('WebSocket connected');
        this.authenticate();
      });

      this.socket.on('message', (data) => {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      });

      this.socket.on('close', () => {
        console.log('WebSocket disconnected');
      });

      this.socket.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      throw error;
    }
  }

  authenticate() {
    this.sendToWebSocket('auth', [this.token]);
  }

  sendToWebSocket(event, args) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, args }));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  handleWebSocketMessage(message) {
    switch (message.event) {
      case 'auth success':
        console.log('Authentication successful');
        this.sendToWebSocket('send logs', [null]);
        break;
      case 'token expiring':
        console.log('Token is expiring soon, requesting a new one');
        this.refreshToken();
        break;
      case 'token expired':
        console.log('Token has expired, requesting a new one');
        this.refreshToken();
        break;
      case 'status':
      case 'console output':
      case 'stats':
        if (this.eventHandlers[message.event]) {
          this.eventHandlers[message.event](message.args);
        }
        break;
      default:
        console.log('Unhandled WebSocket message:', message);
    }
  }

  async refreshToken() {
    try {
      const response = await axios.get(`${this.apiUrl}/api/client/servers/${this.serverId}/websocket`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      this.token = response.data.data.token;
      this.authenticate();
    } catch (error) {
      console.error('Error refreshing token:', error);
    }
  }

  on(event, callback) {
    this.eventHandlers[event] = callback;
  }

  requestStats() {
    this.sendToWebSocket('send stats', [null]);
  }

  sendCommand(command) {
    this.sendToWebSocket('send command', [command]);
  }

  setPowerState(state) {
    this.sendToWebSocket('set state', [state]);
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

module.exports = PterodactylClientModule;