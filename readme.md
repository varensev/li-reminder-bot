# Telegram Reminder Bot - Docker Deployment on Aeza

## Overview

This project provides a Dockerized Telegram bot for sending publication reminders, designed for deployment on Aeza hosting. The bot integrates with Supabase for data storage and uses Node.js with the `node-telegram-bot-api` library.

## Project Structure

```
li-reminder-bot/
├── Dockerfile            # Docker container configuration
├── docker-compose.yml    # Orchestration configuration
├── bot.js                # Main bot application code
├── package.json          # Node.js dependencies and scripts
└── package-lock.json     # Exact dependency versions
```

## Prerequisites

- Docker installed on your system
- Aeza VPS with Ubuntu 22.04 LTS
- Telegram bot token from @BotFather
- Supabase project URL and API key

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repository/li-reminder-bot.git
   cd li-reminder-bot
   ```

2. Create `.env` file:
   ```bash
   nano .env
   ```
   Add your credentials:
   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-key
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   ```

3. Build and run the container:
   ```bash
   docker-compose up -d --build
   ```

## Configuration Files

### Dockerfile
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "bot.js"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  bot:
    build: .
    container_name: li-reminder-bot
    restart: unless-stopped
    env_file: .env
    environment:
      - NODE_ENV=production
    volumes:
      - ./logs:/app/logs
```

### package.json
```json
{
  "name": "li-reminder-bot",
  "version": "1.0.0",
  "description": "Telegram bot for publication reminders with Supabase",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js",
    "dev": "nodemon bot.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "node-telegram-bot-api": "^0.61.0",
    "node-cron": "^3.0.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## Deployment on Aeza

### Server Setup
1. Create a new VPS on Aeza with:
   - Ubuntu 22.04 LTS
   - Minimum 1GB RAM
   - 10GB SSD storage
   - Select "Install Docker" during creation

2. Connect to your server:
   ```bash
   ssh root@your-server-ip
   ```

3. Install required packages:
   ```bash
   apt update && apt upgrade -y
   apt install -y git docker-compose
   ```

### Bot Deployment
1. Clone your repository:
   ```bash
   git clone https://github.com/your-repository/li-reminder-bot.git
   cd li-reminder-bot
   ```

2. Create and configure the `.env` file as shown in Quick Start

3. Start the bot:
   ```bash
   docker-compose up -d --build
   ```

4. Verify operation:
   ```bash
   docker logs -f li-reminder-bot
   ```

## Maintenance

### Updating the Bot
```bash
cd ~/li-reminder-bot
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Stopping the Bot
```bash
docker-compose down
```

### Viewing Logs
```bash
docker logs -f li-reminder-bot
```

## Security Recommendations

1. Configure firewall:
   ```bash
   ufw allow 22
   ufw allow 80
   ufw allow 443
   ufw enable
   ```

2. Set up automatic security updates:
   ```bash
   apt install -y unattended-upgrades
   dpkg-reconfigure -plow unattended-upgrades
   ```

3. Monitor system resources:
   ```bash
   apt install -y htop
   ```

## Features

- **Security**: Sensitive data stored in environment variables, minimal Alpine-based image
- **Reliability**: Automatic restart policy, log persistence
- **Scalability**: Easy to add new services via docker-compose
- **Optimization**: Dependency caching, small image size

## Troubleshooting

If you encounter issues:
1. Check container logs:
   ```bash
   docker logs li-reminder-bot
   ```
2. Verify container status:
   ```bash
   docker ps -a
   ```
3. Check system resources:
   ```bash
   htop
   ```

For additional support, please open an issue in the project repository.