import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { extractTasksFromContent, generateDailySchedule, processAICommand, analyzeImage } from "./openai";
import { insertTaskSchema, insertRecurringTaskSchema, insertDailyScheduleSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  setupAuth(app);

  // Auth routes
  app.get('/api/user', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Task Management Routes
  app.post('/api/tasks/extract', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      let content = '';
      
      if (req.file) {
        // Handle file upload
        const fileBuffer = req.file.buffer;
        const mimeType = req.file.mimetype;
        
        if (mimeType.startsWith('image/')) {
          const base64Image = fileBuffer.toString('base64');
          const tasks = await analyzeImage(base64Image);
          return res.json({ tasks });
        } else if (mimeType === 'text/plain') {
          content = fileBuffer.toString('utf-8');
        } else {
          return res.status(400).json({ message: 'Unsupported file type' });
        }
      } else {
        content = req.body.content || '';
      }

      if (!content.trim()) {
        return res.status(400).json({ message: 'No content provided for extraction' });
      }

      const tasks = await extractTasksFromContent(content);
      res.json({ tasks });
    } catch (error) {
      console.error("Error extracting tasks:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to extract tasks";
      res.status(500).json({ message: errorMessage });
    }
  });

  app.post('/api/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const taskData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask({ ...taskData, userId: req.user.id });
      res.status(201).json(task);
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'task_created', data: task });
    } catch (error) {
      console.error("Error creating task:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create task";
      res.status(400).json({ message: errorMessage });
    }
  });

  app.get('/api/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const filters = {
        status: req.query.status ? req.query.status.split(',') : undefined,
        category: req.query.category,
        subcategory: req.query.subcategory,
        timeHorizon: req.query.timeHorizon,
        dueDate: req.query.dueDate ? {
          gte: req.query.dueDateGte ? new Date(req.query.dueDateGte) : undefined,
          lte: req.query.dueDateLte ? new Date(req.query.dueDateLte) : undefined,
        } : undefined,
      };
      
      const tasks = await storage.getTasks(req.user.id, filters);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.put('/api/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const updates = insertTaskSchema.partial().parse(req.body);
      const task = await storage.updateTask(req.params.id, req.user.id, updates);
      res.json(task);
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'task_updated', data: task });
    } catch (error) {
      console.error("Error updating task:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update task";
      res.status(400).json({ message: errorMessage });
    }
  });

  app.delete('/api/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteTask(req.params.id, req.user.id);
      res.status(204).send();
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'task_deleted', data: { id: req.params.id } });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Planning Matrix Routes
  app.get('/api/planning/matrix', isAuthenticated, async (req: any, res) => {
    try {
      const tasks = await storage.getTasks(req.user.id);
      
      // Organize tasks by time horizon and category
      const matrix = {};
      const timeHorizons = ['VISION', '10 Year', '5 Year', '1 Year', 'Quarter', 'Week', 'Today', 'BACKLOG'];
      const categories = ['Physical', 'Mental', 'Relationship', 'Environmental', 'Financial', 'Adventure', 'Marketing', 'Sales', 'Operations', 'Products', 'Production'];
      
      timeHorizons.forEach(horizon => {
        matrix[horizon] = {};
        categories.forEach(category => {
          matrix[horizon][category] = [];
        });
      });
      
      tasks.forEach(task => {
        const horizon = task.timeHorizon || 'BACKLOG';
        const category = task.subcategory || 'Mental';
        
        if (matrix[horizon] && matrix[horizon][category]) {
          matrix[horizon][category].push(task);
        }
      });
      
      res.json(matrix);
    } catch (error) {
      console.error("Error fetching planning matrix:", error);
      res.status(500).json({ message: "Failed to fetch planning matrix" });
    }
  });

  app.post('/api/planning/move', isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body with Zod schema
      const moveTaskSchema = z.object({
        taskId: z.string().uuid(),
        newTimeHorizon: z.enum(["VISION", "10 Year", "5 Year", "1 Year", "Quarter", "Week", "Today", "BACKLOG"]).optional(),
        newSubcategory: z.enum(["Physical", "Mental", "Relationship", "Environmental", "Financial", "Adventure", "Marketing", "Sales", "Operations", "Products", "Production"]).optional(),
        newCategory: z.enum(["Personal", "Business"]).optional(),
      });

      const validationResult = moveTaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.issues 
        });
      }

      const { taskId, newTimeHorizon, newSubcategory, newCategory } = validationResult.data;
      
      const updates: any = {};
      if (newTimeHorizon) updates.timeHorizon = newTimeHorizon;
      if (newSubcategory) updates.subcategory = newSubcategory;
      if (newCategory) updates.category = newCategory;
      
      const task = await storage.updateTask(taskId, req.user.id, updates);
      res.json(task);
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'task_moved', data: task });
    } catch (error) {
      console.error("Error moving task:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to move task";
      res.status(400).json({ message: errorMessage });
    }
  });

  // Daily Schedule Routes
  app.get('/api/daily/:date', isAuthenticated, async (req: any, res) => {
    try {
      const date = new Date(req.params.date);
      const schedule = await storage.getDailySchedule(req.user.id, date);
      res.json(schedule);
    } catch (error) {
      console.error("Error fetching daily schedule:", error);
      res.status(500).json({ message: "Failed to fetch daily schedule" });
    }
  });

  app.post('/api/daily/generate', isAuthenticated, async (req: any, res) => {
    try {
      const { date } = req.body;
      const userId = req.user.id;
      
      // Get available tasks and recurring tasks
      const tasks = await storage.getTasks(userId, { 
        status: ['not_started', 'in_progress'],
      });
      const recurringTasks = await storage.getRecurringTasks(userId);
      
      // Get user preferences (you might want to store these in user profile)
      const userPreferences = {
        workHours: { start: "9:00", end: "17:00" },
        energyPatterns: {}
      };
      
      const aiSchedule = await generateDailySchedule(tasks, recurringTasks, userPreferences);
      res.json(aiSchedule);
    } catch (error) {
      console.error("Error generating daily schedule:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate daily schedule";
      res.status(500).json({ message: errorMessage });
    }
  });

  app.put('/api/daily/update', isAuthenticated, async (req: any, res) => {
    try {
      const { id, ...updates } = req.body;
      const scheduleData = insertDailyScheduleSchema.partial().parse(updates);
      const entry = await storage.updateDailyScheduleEntry(id, req.user.id, scheduleData);
      res.json(entry);
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'schedule_updated', data: entry });
    } catch (error) {
      console.error("Error updating daily schedule:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update schedule";
      res.status(400).json({ message: errorMessage });
    }
  });

  // AI Integration Routes
  app.post('/api/ai/chat', isAuthenticated, async (req: any, res) => {
    try {
      const { message } = req.body;
      
      // Get context data
      const tasks = await storage.getTasks(req.user.id);
      const context = { tasks };
      
      const aiResponse = await processAICommand(message, context);
      res.json(aiResponse);
    } catch (error) {
      console.error("Error processing AI chat:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to process AI request";
      res.status(500).json({ message: errorMessage });
    }
  });

  // Recurring Tasks Routes
  app.get('/api/recurring-tasks', isAuthenticated, async (req: any, res) => {
    try {
      const dayOfWeek = req.query.dayOfWeek;
      const recurringTasks = await storage.getRecurringTasks(req.user.id, dayOfWeek);
      res.json(recurringTasks);
    } catch (error) {
      console.error("Error fetching recurring tasks:", error);
      res.status(500).json({ message: "Failed to fetch recurring tasks" });
    }
  });

  app.post('/api/recurring-tasks', isAuthenticated, async (req: any, res) => {
    try {
      const taskData = insertRecurringTaskSchema.parse(req.body);
      const task = await storage.createRecurringTask({ ...taskData, userId: req.user.id });
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating recurring task:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create recurring task";
      res.status(400).json({ message: errorMessage });
    }
  });

  const httpServer = createServer(app);
  
  // WebSocket Setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const userConnections = new Map<string, Set<WebSocket>>();

  wss.on('connection', (ws, req) => {
    let userId: string | null = null;
    
    // Secure WebSocket authentication using session cookie
    async function authenticateConnection() {
      try {
        // Parse cookies from WebSocket request
        const cookies = req.headers.cookie;
        if (!cookies) {
          ws.close(1008, 'Authentication required');
          return;
        }
        
        // Extract session ID from cookies (connect.sid)
        const sessionCookie = cookies.split(';')
          .find(cookie => cookie.trim().startsWith('connect.sid='));
        
        if (!sessionCookie) {
          ws.close(1008, 'Session cookie not found');
          return;
        }
        
        // Properly decode the session ID (URL-encoded)
        const encodedSessionId = sessionCookie.split('=')[1];
        const sessionId = decodeURIComponent(encodedSessionId);
        
        // Remove the 's:' prefix and signature from signed cookie
        const actualSessionId = sessionId.startsWith('s:') 
          ? sessionId.substring(2).split('.')[0] 
          : sessionId;
        
        // Get session from store
        const sessionStore = storage.sessionStore;
        const sessionData = await new Promise<any>((resolve, reject) => {
          sessionStore.get(actualSessionId, (err, session) => {
            if (err) reject(err);
            else resolve(session);
          });
        });
        
        if (!sessionData || !sessionData.passport?.user) {
          ws.close(1008, 'Invalid or expired session');
          return;
        }
        
        // Extract authenticated user ID from session
        userId = sessionData.passport.user;
        
        // Add connection to user's connection set
        if (!userConnections.has(userId)) {
          userConnections.set(userId, new Set());
        }
        userConnections.get(userId)!.add(ws);
        
        ws.send(JSON.stringify({ type: 'auth_success', userId }));
        
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        ws.close(1008, 'Authentication failed');
      }
    }
    
    // Authenticate immediately on connection
    authenticateConnection();
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Only accept messages from authenticated connections
        if (!userId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
          return;
        }
        
        // Handle authenticated WebSocket messages here if needed
        // For now, just echo back for testing
        ws.send(JSON.stringify({ type: 'message_received', data }));
        
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      if (userId && userConnections.has(userId)) {
        userConnections.get(userId)!.delete(ws);
        if (userConnections.get(userId)!.size === 0) {
          userConnections.delete(userId);
        }
      }
    });
  });

  // Helper function to broadcast to specific user
  function broadcastToUser(userId: string, message: any) {
    if (userConnections.has(userId)) {
      const connections = userConnections.get(userId)!;
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      });
    }
  }

  return httpServer;
}
