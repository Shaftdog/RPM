import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { extractTasksFromContent, generateDailySchedule, processAICommand, analyzeImage, extractRecurringTasksFromContent, processRecurringTaskChatCommand } from "./openai";
import { 
  insertTaskSchema, 
  insertRecurringTaskSchema, 
  insertRecurringScheduleSchema,
  insertTaskSkipSchema,
  insertDailyScheduleSchema 
} from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import mammoth from "mammoth";

// PDF text extraction using pdfjs-dist
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist');
    
    const loadingTask = pdfjs.getDocument({
      data: buffer,
      worker: undefined, // Avoid worker file resolution issues
    });
    
    const pdf = await loadingTask.promise;
    let text = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      text += pageText + '\n';
    }
    
    return text.trim();
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure multer for multiple file uploads
const uploadMultiple = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  setupAuth(app);

  // Auth routes
  app.get('/api/user', isAuthenticated, async (req: any, res) => {
    try {
      // Disable caching to prevent 304 responses that break authentication
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('ETag', Date.now().toString());
      
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
      const parseDate = (value: unknown) => {
        if (typeof value !== "string") return undefined;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
      };

      const dueDateGte = parseDate(req.query.dueDateGte);
      const dueDateLte = parseDate(req.query.dueDateLte);
      const singleDueDate = parseDate(req.query.dueDate);
      const xDateGte = parseDate(req.query.xDateGte);
      const xDateLte = parseDate(req.query.xDateLte);
      const singleXDate = parseDate(req.query.xDate);

      const filters = {
        status: req.query.status ? req.query.status.split(',') : undefined,
        category: req.query.category,
        subcategory: req.query.subcategory,
        timeHorizon: req.query.timeHorizon,
        dueDate:
          dueDateGte || dueDateLte
            ? {
                gte: dueDateGte,
                lte: dueDateLte,
              }
            : singleDueDate
            ? {
                gte: singleDueDate,
                lte: singleDueDate,
              }
            : undefined,
        xDate:
          xDateGte || xDateLte
            ? {
                gte: xDateGte,
                lte: xDateLte,
              }
            : singleXDate
            ? {
                gte: singleXDate,
                lte: singleXDate,
              }
            : undefined,
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
      const matrix: Record<string, Record<string, any[]>> = {};
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
        xDate: z.string().datetime().optional(),
      });

      const validationResult = moveTaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.issues 
        });
      }

      const { taskId, newTimeHorizon, newSubcategory, newCategory, xDate } = validationResult.data;
      
      const updates: any = {};
      if (newTimeHorizon) updates.timeHorizon = newTimeHorizon;
      if (newSubcategory) updates.subcategory = newSubcategory;
      if (newCategory) updates.category = newCategory;
      if (xDate) updates.xDate = new Date(xDate);
      
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

  // Helper functions for AI schedule normalization
  function mapStartTimeToCanonicalBlock(startTime: string): string {
    const timeBlocks = [
      { name: "Recover", start: "00:00", end: "07:00" },
      { name: "PHYSICAL MENTAL", start: "07:00", end: "09:00" },
      { name: "CHIEF PROJECT", start: "09:00", end: "11:00" },
      { name: "HOUR OF POWER", start: "11:00", end: "12:00" },
      { name: "PRODUCTION WORK", start: "12:00", end: "14:00" },
      { name: "COMPANY BLOCK", start: "14:00", end: "16:00" },
      { name: "BUSINESS AUTOMATION", start: "16:00", end: "18:00" },
      { name: "ENVIRONMENTAL", start: "18:00", end: "20:00" },
      { name: "FLEXIBLE BLOCK", start: "20:00", end: "22:00" },
      { name: "WIND DOWN", start: "22:00", end: "24:00" },
    ];
    
    // Find the time block that contains this start time
    for (const block of timeBlocks) {
      if (startTime >= block.start && startTime < block.end) {
        return block.name;
      }
    }
    return "FLEXIBLE BLOCK"; // Default fallback
  }

  function mapQuartileLabel(quartileStr: string): number {
    if (!quartileStr) return 1;
    const lower = quartileStr.toLowerCase();
    if (lower.includes('1st') || lower.includes('first')) return 1;
    if (lower.includes('2nd') || lower.includes('second')) return 2;
    if (lower.includes('3rd') || lower.includes('third')) return 3;
    if (lower.includes('4th') || lower.includes('fourth')) return 4;
    return 1; // Default to first quartile
  }

  function resolveTaskIdByName(taskName: string, nameToId: Map<string, string>): string | undefined {
    if (!taskName) return undefined;
    
    const cleanName = taskName.toLowerCase().trim();
    
    // Exact match first
    if (nameToId.has(cleanName)) {
      return nameToId.get(cleanName);
    }
    
    // Partial match - check if any task name contains the search term
    for (const [name, id] of Array.from(nameToId.entries())) {
      if (name.includes(cleanName) || cleanName.includes(name)) {
        return id;
      }
    }
    
    return undefined; // No match found
  }

  function normalizeAIScheduleToEntries(
    aiSchedule: any, 
    date: Date, 
    nameToId: Map<string, string>
  ): Array<{ date: Date; timeBlock: string; quartile: number; plannedTaskId?: string; status: 'not_started' }> {
    const entries = [];
    
    // Handle array format (local fallback or structured response)
    if (Array.isArray(aiSchedule.schedule)) {
      for (const block of aiSchedule.schedule) {
        let taskList = [];
        
        // Extract tasks from different possible structures
        if (block.tasks && Array.isArray(block.tasks)) {
          taskList = block.tasks;
        } else if (block.quartiles && Array.isArray(block.quartiles)) {
          taskList = block.quartiles.map((q: any) => q.task).filter(Boolean);
        } else if (block.task && typeof block.task === 'object' && block.task.id) {
          // New format: single task object per time block
          taskList = [block.task];
        }
        
        // Create entries for up to 4 tasks per time block
        for (let i = 0; i < Math.min(taskList.length, 4); i++) {
          const task = taskList[i];
          const taskId = task.id || resolveTaskIdByName(task.name, nameToId);
          
          // Create entry even if no task ID (for recurring tasks)
          // plannedTaskId can be null for recurring tasks that don't have a corresponding task entry
          entries.push({
            date,
            timeBlock: block.timeBlock,
            quartile: i + 1,
            plannedTaskId: taskId || null,
            status: 'not_started' as const
          });
        }
      }
    } 
    // Handle flat object format (current OpenAI response)
    else {
      for (const [timeRange, val] of Object.entries(aiSchedule)) {
        if (timeRange === 'source') continue; // Skip metadata
        
        // Parse start time from range like "17:00-19:00"
        const startMatch = timeRange.match(/^(\d{2}:\d{2})/);
        if (!startMatch) continue;
        
        const startTime = startMatch[1];
        const timeBlock = mapStartTimeToCanonicalBlock(startTime);
        const quartile = mapQuartileLabel((val as any).quartile);
        
        // Handle different task formats in flat object response
        let taskId: string | undefined;
        const valAny = val as any;
        if (valAny.task && valAny.task.id) {
          // New format: complete task objects with ID
          taskId = valAny.task.id;
        } else if (valAny.assignedTask) {
          // Old format: task names requiring lookup
          taskId = resolveTaskIdByName(valAny.assignedTask, nameToId);
        }
        
        // Create entry even if no task ID (for recurring tasks)
        entries.push({
          date,
          timeBlock,
          quartile,
          plannedTaskId: taskId || null,
          status: 'not_started' as const
        });
      }
    }
    
    return entries;
  }

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
      // Add server-side timeout guardrail  
      res.setTimeout(15000, () => {
        if (!res.headersSent) {
          res.status(504).json({ message: 'AI generation timed out' });
        }
      });

      const { date } = req.body;
      const userId = req.user.id;
      
      // Get available tasks and recurring tasks with instrumentation
      console.time('fetch_tasks');
      const tasks = await storage.getTasks(userId, { 
        status: ['not_started', 'in_progress'],
      });
      console.timeEnd('fetch_tasks');
      
      console.time('fetch_recurring');
      const recurringTasks = await storage.getRecurringTasks(userId);
      console.timeEnd('fetch_recurring');
      
      // Get user preferences (you might want to store these in user profile)
      const userPreferences = {
        workHours: { start: "9:00", end: "17:00" },
        energyPatterns: {}
      };
      
      // Filter out Milestones and Sub-Milestones from scheduling
      // These are deliverables, not actionable tasks that should be time-blocked
      const tasksForScheduling = tasks.filter(task => 
        task.type !== 'Milestone' && task.type !== 'Sub-Milestone'
      );

      console.time('generate_schedule');
      const aiSchedule = await generateDailySchedule(tasksForScheduling, recurringTasks, userPreferences);
      console.timeEnd('generate_schedule');
      
      // Build task name index for name→ID lookup (only from schedulable tasks)
      const nameToId = new Map<string, string>();
      tasksForScheduling.forEach(task => {
        nameToId.set(task.name.toLowerCase().trim(), task.id);
      });
      
      // Normalize AI schedule to database entries
      const scheduleDate = new Date(date);
      const scheduleEntries = normalizeAIScheduleToEntries(aiSchedule, scheduleDate, nameToId);
      
      // Final guard: Filter out any entries that reference Milestone or Sub-Milestone tasks
      // This ensures no Milestones can slip through via direct ID references
      const allowedIdSet = new Set(tasksForScheduling.map(task => task.id));
      const filteredScheduleEntries = scheduleEntries.filter(entry => 
        // Allow entries with no task ID (recurring tasks) or valid task IDs
        !entry.plannedTaskId || allowedIdSet.has(entry.plannedTaskId)
      );
      
      // Clear existing schedule for this date and save new entries
      if (filteredScheduleEntries.length > 0) {
        console.log(`Saving ${filteredScheduleEntries.length} schedule entries for ${date}`);
        await storage.clearDailySchedule(userId, scheduleDate);
        await storage.createDailyScheduleEntries(userId, filteredScheduleEntries);
      }
      
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

  // Recurring Tasks Extract Route
  app.post('/api/recurring-tasks/extract', isAuthenticated, uploadMultiple.array('files'), async (req: any, res) => {
    try {
      let content = '';
      let tasks: any[] = [];
      
      if (req.files && req.files.length > 0) {
        // Handle multiple file uploads
        for (const file of req.files) {
          const fileBuffer = file.buffer;
          const mimeType = file.mimetype;
          
          if (mimeType.startsWith('image/')) {
            const base64Image = fileBuffer.toString('base64');
            const imageTasks = await analyzeImage(base64Image, mimeType);
            // Convert regular tasks to recurring tasks format
            const recurringTasks = imageTasks.map(task => ({
              taskName: task.name,
              taskType: task.type,
              timeBlock: 'FLEXIBLE BLOCK (8-10PM)', // Default time block
              daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
              category: task.category,
              subcategory: task.subcategory,
              durationMinutes: Math.round((task.estimatedTime || 1) * 60),
              energyImpact: 0,
              priority: task.priority,
              description: task.description || task.why || '',
              tags: []
            }));
            tasks.push(...recurringTasks);
          } else if (mimeType === 'text/plain') {
            const textContent = fileBuffer.toString('utf-8');
            content += textContent + '\n';
          } else if (mimeType === 'application/pdf') {
            try {
              const pdfText = await extractPdfText(fileBuffer);
              if (!pdfText || pdfText.trim().length === 0) {
                return res.status(400).json({ message: 'PDF appears to contain no extractable text. Please ensure it is a text-based PDF, not a scanned image.' });
              }
              content += pdfText + '\n';
            } catch (pdfError) {
              console.error('Error parsing PDF:', pdfError);
              return res.status(400).json({ message: 'Failed to parse PDF file. Please ensure it contains extractable text.' });
            }
          } else if (mimeType.includes('officedocument.wordprocessingml') || mimeType.includes('msword')) {
            try {
              const docData = await mammoth.extractRawText({ buffer: fileBuffer });
              content += docData.value + '\n';
            } catch (docError) {
              console.error('Error parsing DOC file:', docError);
              return res.status(400).json({ message: 'Failed to parse DOC file. Please ensure it is a valid Word document.' });
            }
          } else {
            return res.status(400).json({ message: `Unsupported file type: ${mimeType}` });
          }
        }
      } else {
        content = req.body.content || '';
      }

      if (content.trim()) {
        console.log('Processing text content for task extraction, length:', content.length);
        const contentTasks = await extractRecurringTasksFromContent(content);
        console.log('OpenAI text extraction returned tasks:', contentTasks.length, contentTasks);
        tasks.push(...contentTasks);
      }

      if (tasks.length === 0) {
        return res.status(400).json({ message: 'No content provided for extraction or no tasks found' });
      }

      res.json({ tasks });
    } catch (error) {
      console.error("Error extracting recurring tasks:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to extract recurring tasks";
      res.status(500).json({ message: errorMessage });
    }
  });

  // Recurring Tasks Chat Route
  app.post('/api/recurring-tasks/chat', isAuthenticated, async (req: any, res) => {
    try {
      const { message, context } = req.body;
      
      if (!message || !message.trim()) {
        return res.status(400).json({ message: 'Message is required' });
      }

      const chatContext = {
        extractedTasks: context?.extractedTasks || [],
        uploadedFiles: context?.uploadedFiles || [],
        recurringTasks: context?.recurringTasks || []
      };
      
      const aiResponse = await processRecurringTaskChatCommand(message.trim(), chatContext);
      res.json(aiResponse);
    } catch (error) {
      console.error("Error processing recurring task chat:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to process chat command";
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

  app.put('/api/recurring-tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const taskData = insertRecurringTaskSchema.partial().parse(req.body);
      const task = await storage.updateRecurringTask(req.params.id, req.user.id, taskData);
      res.json(task);
    } catch (error) {
      console.error("Error updating recurring task:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update recurring task";
      res.status(400).json({ message: errorMessage });
    }
  });

  app.delete('/api/recurring-tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteRecurringTask(req.params.id, req.user.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting recurring task:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete recurring task";
      res.status(400).json({ message: errorMessage });
    }
  });

  // Recurring Schedule Routes
  app.get('/api/recurring/schedule', isAuthenticated, async (req: any, res) => {
    try {
      const recurringTaskId = req.query.recurringTaskId;
      const schedules = await storage.getRecurringSchedules(req.user.id, recurringTaskId);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching recurring schedules:", error);
      res.status(500).json({ message: "Failed to fetch recurring schedules" });
    }
  });

  app.post('/api/recurring/schedule', isAuthenticated, async (req: any, res) => {
    try {
      const scheduleData = insertRecurringScheduleSchema.parse(req.body);
      const schedule = await storage.createRecurringSchedule(scheduleData, req.user.id);
      res.status(201).json(schedule);
    } catch (error) {
      console.error("Error creating recurring schedule:", error);
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        res.status(403).json({ message: 'Unauthorized' });
      } else {
        const errorMessage = error instanceof Error ? error.message : "Failed to create recurring schedule";
        res.status(400).json({ message: errorMessage });
      }
    }
  });

  app.put('/api/recurring/schedule/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scheduleData = insertRecurringScheduleSchema.partial().parse(req.body);
      const schedule = await storage.updateRecurringSchedule(req.params.id, req.user.id, scheduleData);
      res.json(schedule);
    } catch (error) {
      console.error("Error updating recurring schedule:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update recurring schedule";
      res.status(400).json({ message: errorMessage });
    }
  });

  app.delete('/api/recurring/schedule/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteRecurringSchedule(req.params.id, req.user.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting recurring schedule:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete recurring schedule";
      res.status(400).json({ message: errorMessage });
    }
  });

  // Task Skip Routes
  app.get('/api/recurring/skip/:scheduleId', isAuthenticated, async (req: any, res) => {
    try {
      const skips = await storage.getTaskSkips(req.params.scheduleId, req.user.id);
      res.json(skips);
    } catch (error) {
      console.error("Error fetching task skips:", error);
      res.status(500).json({ message: "Failed to fetch task skips" });
    }
  });

  app.post('/api/recurring/skip', isAuthenticated, async (req: any, res) => {
    try {
      const skipData = insertTaskSkipSchema.parse(req.body);
      const skip = await storage.createTaskSkip(skipData, req.user.id);
      res.status(201).json(skip);
    } catch (error) {
      console.error("Error creating task skip:", error);
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        res.status(403).json({ message: 'Unauthorized' });
      } else {
        const errorMessage = error instanceof Error ? error.message : "Failed to create task skip";
        res.status(400).json({ message: errorMessage });
      }
    }
  });

  app.delete('/api/recurring/skip/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteTaskSkip(req.params.id, req.user.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting task skip:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete task skip";
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
        if (userId) {
          if (!userConnections.has(userId)) {
            userConnections.set(userId, new Set());
          }
          userConnections.get(userId)!.add(ws);
        }
        
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
