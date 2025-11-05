# AI-Driven Personal Productivity System

## Overview

This is a comprehensive AI-driven personal productivity system built as a full-stack web application. The system captures tasks from various inputs (chat, file uploads), intelligently organizes them using AI analysis, and provides strategic planning through a matrix-based interface. It includes a daily scheduling worksheet with time-blocking features and energy management capabilities.

The application follows a modern full-stack architecture with a React frontend using shadcn/ui components, an Express.js backend with PostgreSQL database integration via Drizzle ORM, and OpenAI API integration for intelligent task extraction and scheduling.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

**Frontend Architecture**
- React with TypeScript for type safety and modern development patterns
- shadcn/ui component library built on Radix UI primitives for consistent, accessible design
- TailwindCSS for utility-first styling with custom CSS variables for theming
- Vite as the build tool for fast development and optimized production builds
- TanStack Query for server state management and API caching
- Wouter for lightweight client-side routing

**Backend Architecture**  
- Express.js server with TypeScript for API endpoints and middleware
- Passport.js with local strategy for authentication using bcrypt password hashing
- Express sessions with PostgreSQL session store for secure user sessions
- WebSocket integration for real-time updates and communication
- Multer middleware for file upload handling (images, documents)
- Structured API routes with comprehensive error handling and logging

**Database Design**
- PostgreSQL database with Drizzle ORM for type-safe database operations
- Comprehensive schema including users, tasks, task dependencies, task hierarchy, recurring tasks, daily schedules, and user settings tables
- Support for complex task relationships through dependency and hierarchy tables
- Structured enums for task types, categories, subcategories, priorities, and time horizons

**AI Integration Strategy**
- OpenAI GPT-5 API integration for intelligent task extraction from various content types
- Image analysis capabilities for extracting tasks from visual content
- Automated task categorization and priority assignment
- AI-powered daily schedule generation and optimization
- Natural language processing for conversational task input

**Authentication & Authorization**
- Session-based authentication with secure password hashing using scrypt
- User profile management with customizable work hours and energy patterns
- Protected routes with authentication middleware
- Secure session management with PostgreSQL-backed session store

**File Processing System**
- Support for multiple file types: PDF, TXT, DOC, JPG, PNG
- Image analysis for task extraction using OpenAI Vision API
- Text file parsing and content extraction
- Drag-and-drop file upload interface with size limitations

**Real-time Features**
- WebSocket connections for live updates across the application
- Real-time task updates and collaboration features
- Live chat interface for AI interaction
- Instant feedback for task modifications and scheduling changes

**UI/UX Architecture**
- Three main application views: Task Capture, Strategic Planning Matrix, and Daily Worksheet
- Split-screen interface for simultaneous chat and task preview
- Editable task table with comprehensive field management
- Time-blocking interface with visual scheduling components
- Responsive design supporting both desktop and mobile workflows

**Task Management System**
- Hierarchical task organization (Milestone > Sub-Milestone > Task > Subtask)
- Dual categorization system (Personal/Business with detailed subcategories)
- Time horizon planning from daily tasks to 10-year goals
- Dependency tracking and hierarchical task relationships
- Progress tracking with estimated vs actual time logging

**Daily Scheduling System**
- Structured time blocks with predefined categories (Physical Mental, Chief Project, Hour of Power, etc.)
- Quartile-based time management within each block
- Energy level tracking and optimization
- Reflection and actual vs planned comparison
- Recurring task integration with daily schedules
- AI schedule generation that preserves recurring tasks: when generating an AI schedule, existing recurring tasks (marked with RECURRING_TASK: prefix in reflection field) are identified and preserved, with AI only filling unoccupied time slots
- Clear Schedule feature: allows users to remove all tasks from the daily schedule with a confirmation dialog to prevent accidental deletions