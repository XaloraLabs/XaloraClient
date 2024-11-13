# Heliactyl Next 3 / `aeolus`

[![GitHub Last Commit](https://img.shields.io/github/last-commit/heliactyloss/next)](https://github.com/heliactyloss/next/commits/main)
[![GitHub Release](https://img.shields.io/github/v/release/heliactyloss/next)](https://github.com/heliactyloss/heliactyl/next)
[![License](https://img.shields.io/github/license/heliactyloss/next)](https://github.com/heliactyloss/next/blob/main/LICENSE)

Heliactyl is a powerful, feature-rich client area for the Pterodactyl Panel, designed to enhance user experience and server management capabilities. It allows your users to create, manage, and customize their game servers - powered with Heliactyl's in-house coin-based economy system for resource upgrades.

## Important

Heliactyl Next introduces breaking changes to the configuration system. The `settings.json` or `config.toml` format is no longer supported, previous `heliactyl.db` files are not compatible as well.

## 🚀 Features

- **Server Management**: Create, edit, and delete game servers
- **Server Console, Files & more**: Completely replace your Pterodactyl Panel and users will only need Heliactyl
- **Resource Economy**: Built-in coin system for server upgrades
- **User-Friendly Interface**: Modern, responsive design built with TailwindCSS
- **API Integration**: Comprehensive API for external integrations
- **High Performance**: Optimized for scalability and speed
- **OAuth2 Support**: Secure authentication system

## 📋 Prerequisites

- Bun (v1.1.25 or higher)
- NGINX
- SSL Certificate (ex. Certbot)
- Pterodactyl Panel or Pelican installation

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/heliactyloss/next
cd next
```

2. Install dependencies:
```bash
bun install
```

3. Configure settings:
   - Inspect the `src/config/heliactyl.yml` file.
   - Configure required settings:
     - Pterodactyl panel credentials
     - OAuth2 and email settings
     - Database configuration
     - Optional: Coin system settings

4. Start the application:
```bash
bun run start
```

## 🔧 NGINX Configuration

Add the following configuration to your NGINX server block:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # WebSocket Support
    location /ws {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_pass "http://localhost:YOUR_PORT/ws";
    }

    # Main Application
    location / {
        proxy_pass http://localhost:YOUR_PORT/;
        proxy_buffering off;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 💻 Development

Available npm commands:

```bash
bun run app.js  # Start the application
bun run build   # Build TailwindCSS assets
```

## 🔌 API Documentation (v6)

### Authentication
All API endpoints require authentication via bearer token. Add the following header to your requests:
```
Authorization: Bearer YOUR_API_TOKEN
```

### Endpoints

#### Get User Information
```
GET /api/v6/userinfo
Query Parameters:
  - id: string (required) - User ID

Response:
{
  "status": "success",
  "package": {...},
  "extra": {...},
  "userinfo": {...},
  "coins": number | null
}
```

#### Update User Coins
```
POST /api/v6/setcoins
Body:
{
  "id": string,
  "coins": number
}
```

#### Update User Plan
```
POST /api/v6/setplan
Body:
{
  "id": string,
  "package": string | null
}
```

#### Update User Resources
```
POST /api/v6/setresources
Body:
{
  "id": string,
  "ram": number,
  "disk": number,
  "cpu": number,
  "servers": number
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the "SRYDEN PUBLIC USE LICENSE". See the [LICENSE](LICENSE) file for details.

## 🌟 Support

- Issues: [GitHub Issues](https://github.com/heliactyloss/next/issues)
- Discord: [Join our community (Skyport Labs & Heliactyl)](https://discord.gg/GQrXDXzngj)

---

Made with ❤️ by the SRYDEN open-source team.