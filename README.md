
# AI-Driven Personal Productivity System

A comprehensive full-stack web application that captures tasks from various inputs, intelligently organizes them using AI analysis, and provides strategic planning through a matrix-based interface with daily scheduling capabilities.

## Features

### 🤖 AI-Powered Task Extraction
- Natural language task input through chat interface
- File upload support (PDF, TXT, DOC, JPG, PNG)
- Image analysis for visual task extraction using OpenAI Vision API
- Intelligent task categorization and priority assignment

### 📊 Strategic Planning Matrix
- Hierarchical task organization (Milestone > Sub-Milestone > Task > Subtask)
- Dual categorization system (Personal/Business with detailed subcategories)
- Time horizon planning from daily tasks to 10-year goals
- Drag-and-drop task management with dependency tracking

### 📅 Daily Scheduling Worksheet
- Structured time blocks with predefined categories
- Quartile-based time management within each block
- Energy level tracking and optimization
- Reflection and actual vs planned comparison
- Recurring task integration

### 🔐 Authentication & User Management
- Secure session-based authentication
- Customizable user profiles with work hours and energy patterns
- Protected routes and secure data handling

## Tech Stack

### Frontend
- **React** with TypeScript for type safety
- **shadcn/ui** component library built on Radix UI
- **TailwindCSS** for utility-first styling
- **Vite** for fast development and optimized builds
- **TanStack Query** for server state management
- **Wouter** for lightweight client-side routing

### Backend
- **Express.js** with TypeScript
- **PostgreSQL** database with Drizzle ORM
- **Passport.js** for authentication
- **WebSocket** integration for real-time updates
- **Multer** for file upload handling

### AI Integration
- **OpenAI GPT API** for task extraction and analysis
- **OpenAI Vision API** for image-based task extraction
- Intelligent scheduling and optimization algorithms

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd ai-productivity-system
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables:
   - Use the Secrets tool in Replit to add your OpenAI API key
   - Configure database connection settings

4. Initialize the database:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility functions and configurations
│   │   └── pages/          # Page components
├── server/                 # Backend Express application
│   ├── auth.ts            # Authentication middleware
│   ├── db.ts              # Database connection and configuration
│   ├── routes.ts          # API route definitions
│   └── openai.ts          # OpenAI integration
├── shared/                 # Shared types and schemas
└── README.md              # This file
```

## Key Components

### Task Capture Interface
Split-screen interface combining AI chat and task preview functionality. Supports file uploads and natural language task description.

### Strategic Planning Matrix
Matrix-based view for organizing tasks by category (Personal/Business) and time horizon (Today to 10-year goals).

### Daily Worksheet
Time-blocking interface with energy management and reflection capabilities for daily productivity optimization.

## API Endpoints

- `GET /api/user` - Get current user profile
- `GET /api/tasks` - Retrieve user tasks
- `POST /api/tasks` - Create new tasks
- `POST /api/planning/move` - Move tasks in planning matrix
- `POST /api/chat` - AI chat interaction
- `POST /api/upload` - File upload for task extraction

## Database Schema

The application uses a comprehensive PostgreSQL schema with tables for:
- Users and authentication
- Tasks with hierarchical relationships
- Task dependencies and categories
- Daily schedules and time blocks
- User settings and preferences

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and commit them: `git commit -m 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue in the GitHub repository.
