import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { extractTasksFromContent, generateDailySchedule, processAICommand, analyzeImage } from "./openai";
import { insertTaskSchema, insertRecurringTaskSchema, insertDailyScheduleSchema } from "@shared/schema";
import multer from "multer";

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
      res.json(user);
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
      const { taskId, newTimeHorizon, newSubcategory } = req.body;
      
      const updates: any = {};
      if (newTimeHorizon) updates.timeHorizon = newTimeHorizon;
      if (newSubcategory) updates.subcategory = newSubcategory;
      
      const task = await storage.updateTask(taskId, req.user.id, updates);
      res.json(task);
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'task_moved', data: task });
    } catch (error) {
      console.error("Error moving task:", error);
      res.status(400).json({ message: "Failed to move task" });
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
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'auth' && data.userId) {
          userId = data.userId;
          
          if (!userConnections.has(userId)) {
            userConnections.set(userId, new Set());
          }
          userConnections.get(userId)!.add(ws);
          
          ws.send(JSON.stringify({ type: 'auth_success' }));
        }
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
