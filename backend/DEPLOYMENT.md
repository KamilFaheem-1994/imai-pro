# Deployment Guide - Influencer HQ Agent Backend

## Server Details
- **Server:** api.vibeguard.co (170.249.238.154)
- **Domain:** agent.influencerhq.io
- **SSH User:** ubuntu
- **SSH Key:** C:/Users/faheem/.ssh/faheem_ssh
- **External Port:** 4001 (to avoid conflicts with existing services)

## Prerequisites

1. Docker and Docker Compose installed on the server
2. Nginx installed for reverse proxy
3. Certbot for SSL certificates
4. DNS A record: `agent.influencerhq.io` → `170.249.238.154`

## Deployment Steps

### 1. Connect to Server

```bash
ssh -i C:/Users/faheem/.ssh/faheem_ssh ubuntu@170.249.238.154
```

### 2. Clone/Update Repository

```bash
cd /home/ubuntu
git clone <your-repo-url> influencer-hq-agent
# OR if already exists:
cd influencer-hq-agent && git pull
```

### 3. Set Up Environment Variables

```bash
cd /home/ubuntu/influencer-hq-agent/backend
cp .env.example .env
nano .env
```

Add your credentials:
```env
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
PORT=4000
NODE_ENV=production
```

### 4. Build and Run with Docker

```bash
cd /home/ubuntu/influencer-hq-agent/backend
docker-compose up -d --build
```

### 5. Verify Container is Running

```bash
docker ps
docker logs influencer-hq-agent
```

### 6. Set Up Nginx Reverse Proxy

Create Nginx config:
```bash
sudo nano /etc/nginx/sites-available/agent.influencerhq.io
```

Add configuration:
```nginx
server {
    listen 80;
    server_name agent.influencerhq.io;

    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE support - important for real-time logs
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/agent.influencerhq.io /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Set Up SSL with Certbot

```bash
sudo certbot --nginx -d agent.influencerhq.io
```

### 8. Update Frontend API URL

In the frontend `.env.local`:
```env
NEXT_PUBLIC_API_URL=https://agent.influencerhq.io
```

## Useful Commands

### View Logs
```bash
docker logs -f influencer-hq-agent
```

### Restart Container
```bash
docker-compose restart
```

### Rebuild and Restart
```bash
docker-compose down
docker-compose up -d --build
```

### Stop Container
```bash
docker-compose down
```

### Shell into Container
```bash
docker exec -it influencer-hq-agent /bin/bash
```

## Health Check

Test the API:
```bash
curl https://agent.influencerhq.io/api/instagram/test
```

Test SSE endpoint:
```bash
curl -N https://agent.influencerhq.io/api/agents/test-id/stream
```

## Troubleshooting

### Container won't start
1. Check logs: `docker logs influencer-hq-agent`
2. Verify .env file exists and has correct values
3. Check port 4001 isn't in use: `sudo netstat -tulpn | grep 4001`

### Playwright issues
1. The Docker image includes all required browsers
2. If issues persist, rebuild: `docker-compose build --no-cache`

### SSE not working
1. Ensure Nginx has `proxy_buffering off`
2. Check browser console for connection errors
3. Verify CORS is configured correctly

### Instagram login issues
1. Check credentials in .env
2. Delete `ig_session.json` and restart
3. May need to verify account via browser first

## Architecture

```
Internet
    │
    ▼
agent.influencerhq.io (DNS)
    │
    ▼
170.249.238.154:443 (Nginx + SSL)
    │
    ▼
localhost:4001 (Docker Container)
    │
    ▼
App Port 4000 (Express + Playwright)
```

## Important Notes

- **DO NOT** touch existing Docker containers/instances on the server
- Port 4001 is used to avoid conflicts with existing services
- Instagram session is persisted in `ig_session.json` volume mount
- SSE connections require `proxy_buffering off` in Nginx
