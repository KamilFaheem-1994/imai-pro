#!/bin/bash

# Influencer HQ Agent Backend Deployment Script
# Run this on the server after cloning/updating the repository

echo "=== Influencer HQ Agent Deployment ==="

# Navigate to backend directory
cd /home/ubuntu/influencer-hq-agent/backend || exit 1

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "Please create .env from .env.example and add your credentials"
    exit 1
fi

# Stop existing container if running
echo "Stopping existing container..."
docker-compose down 2>/dev/null || true

# Build and start container
echo "Building and starting container..."
docker-compose up -d --build

# Wait for container to be ready
echo "Waiting for container to start..."
sleep 5

# Check if container is running
if docker ps | grep -q influencer-hq-agent; then
    echo "✅ Container is running!"

    # Show logs
    echo ""
    echo "=== Recent Logs ==="
    docker logs --tail 20 influencer-hq-agent

    echo ""
    echo "=== Health Check ==="
    sleep 3
    if curl -s http://localhost:4001/api/instagram/test > /dev/null; then
        echo "✅ API is responding"
    else
        echo "⚠️  API may still be starting up"
    fi
else
    echo "❌ Container failed to start!"
    echo "Check logs: docker logs influencer-hq-agent"
    exit 1
fi

echo ""
echo "=== Deployment Complete ==="
echo "API URL: https://agent.influencerhq.io"
echo "Local port: 4001"
echo ""
echo "Useful commands:"
echo "  View logs:    docker logs -f influencer-hq-agent"
echo "  Restart:      docker-compose restart"
echo "  Stop:         docker-compose down"
