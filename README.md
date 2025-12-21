# Stockroom Dashboard

A comprehensive management and visualization tool for retail stockroom operations. This dashboard integrates data from multiple sources to provide real-time insights into shipments, employee assignments, closing duties, and store performance metrics.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- A Gmail account with an [App Password](https://support.google.com/accounts/answer/185833) (for UPS and Looker data integration)

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd stockroom-dashboard
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory:
   ```env
   PORT=3000
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=your-app-password
   UPS_EMAIL_IMPORT_CRON="*/10 * * * *"
   UPS_EMAIL_IMPORT_DAYS=2
   UPS_EMAIL_DELETE_AFTER_IMPORT=true
   ```

### Running the Application
- **Start the web server**:
  ```bash
  npm start
  ```
  The dashboard will be available at `http://localhost:3000`.

- **Start the data schedulers**:
  - For Looker data sync: `npm run scheduler`
  - For UPS shipment sync: `npm run ups-scheduler`

## 🛠️ Design Choices

### 1. Architecture: Hybrid MPA/SPA
The project uses a Multi-Page Application (MPA) structure with static HTML files served by Express. However, it behaves like a Single-Page Application (SPA) in many sections, using vanilla JavaScript to fetch data from APIs and update the DOM dynamically.
- **Transition to React**: A migration towards React is underway (see `src/` folder), aiming for better component reusability and state management in future versions.

### 2. Data Storage: Flat-File JSON
Instead of a traditional relational database (like PostgreSQL or MySQL), this project uses **JSON files** stored in the `data/` directory.
- **Why?**: 
  - **Simplicity**: No database setup or migrations required.
  - **Portability**: The entire state of the application can be backed up or moved by simply copying the `data/` folder.
  - **Human-Readable**: Data can be inspected and edited manually if necessary.
  - **Performance**: For the expected scale of a single store's operations, file I/O is more than sufficient.

### 3. Real-Time Updates: Server-Sent Events (SSE)
The dashboard uses SSE to broadcast updates (e.g., new shipments, gameplan changes) to all connected clients.
- **Why?**: SSE is a lightweight, unidirectional alternative to WebSockets. Since the dashboard primarily needs the server to push updates to clients, SSE provides a simpler implementation with less overhead.

### 4. Automated Data Integration
The system is designed to be "hands-off" for data entry:
- **UPS Integration**: Automatically parses UPS notification emails to track incoming shipments.
- **Looker Integration**: Fetches and processes automated Looker reports sent via email, extracting KPIs like store performance and employee metrics.
- **Cron Scheduling**: Uses `node-cron` to manage these background tasks reliably.

### 5. Simple Session Management
Authentication is handled via a custom middleware that stores user session data directly in a cookie as a JSON string.
- **Why?**: This avoids the need for a server-side session store or complex JWT implementation, keeping the system lightweight and easy to debug.

## 📦 Project Structure
- `public/`: Static assets and HTML pages.
- `routes/`: Express API routes for different modules (auth, shipments, gameplan, etc.).
- `utils/`: Core logic for data processing, email parsing, and scheduling.
- `data/`: JSON-based data store and uploaded media.
- `chrome-extension/`: A companion tool for browser-based integrations.
- `middleware/`: Custom Express middleware (e.g., authentication).

## 📄 License
This project is licensed under the ISC License.
