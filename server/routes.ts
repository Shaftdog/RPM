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
  insertDailyScheduleSchema,
  updateDailyScheduleSchema,
  insertTaskHierarchySchema,
  BACKLOG_TIME_BLOCK,
  TIME_BLOCKS 
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
          const tasks = await analyzeImage(base64Image, mimeType);
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

  // Bulk task creation with dependency processing
  app.post('/api/tasks/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const tasksData = req.body.tasks;
      if (!Array.isArray(tasksData)) {
        return res.status(400).json({ message: "Expected 'tasks' array in request body" });
      }

      console.log(`Processing bulk creation of ${tasksData.length} tasks with dependencies`);

      // Step 1: Create all tasks first (without dependencies)
      const createdTasks = [];
      const taskNameToIdMap = new Map<string, string>();

      for (const taskData of tasksData) {
        try {
          // Validate each task but exclude dependencies from storage
          const validTaskData = insertTaskSchema.parse({
            name: taskData.name,
            type: taskData.type,
            category: taskData.category,
            subcategory: taskData.subcategory,
            timeHorizon: taskData.timeHorizon,
            priority: taskData.priority,
            estimatedTime: taskData.estimatedTime?.toString(),
            caloriesIntake: taskData.caloriesIntake?.toString(),
            caloriesExpenditure: taskData.caloriesExpenditure?.toString(),
            why: taskData.why,
            description: taskData.description,
            dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
            xDate: taskData.xDate ? new Date(taskData.xDate) : null,
          });

          const createdTask = await storage.createTask({ ...validTaskData, userId: req.user.id });
          createdTasks.push({ ...createdTask, dependencies: taskData.dependencies || [] });
          
          // Map task name to ID for dependency resolution (with normalization)
          const normalizedName = taskData.name.trim().toLowerCase();
          taskNameToIdMap.set(normalizedName, createdTask.id);
          
          console.log(`Created task: "${taskData.name}" with ID: ${createdTask.id}`);
        } catch (taskError) {
          console.error(`Error creating individual task "${taskData.name}":`, taskError);
          // Continue with other tasks rather than failing the entire batch
        }
      }

      console.log(`Successfully created ${createdTasks.length} tasks, now processing dependencies...`);

      // Step 2: Process dependencies and create hierarchical relationships
      const hierarchiesCreated = [];
      for (const task of createdTasks) {
        if (task.dependencies && task.dependencies.length > 0) {
          for (const dependencyName of task.dependencies) {
            // Normalize dependency name for matching
            const normalizedDependencyName = dependencyName.trim().toLowerCase();
            const parentTaskId = taskNameToIdMap.get(normalizedDependencyName);
            
            if (parentTaskId && parentTaskId !== task.id) {
              try {
                // Create hierarchical relationship (dependency becomes parent)
                const hierarchy = await storage.createTaskHierarchy({
                  parentTaskId: parentTaskId,
                  childTaskId: task.id
                }, req.user.id);
                
                hierarchiesCreated.push(hierarchy);
                console.log(`Created hierarchy: "${dependencyName}" (${parentTaskId}) -> "${task.name}" (${task.id})`);
              } catch (hierarchyError) {
                console.error(`Error creating hierarchy relationship between "${dependencyName}" and "${task.name}":`, hierarchyError);
                // Continue processing other relationships
              }
            } else if (!parentTaskId) {
              console.warn(`Dependency "${dependencyName}" not found in created tasks for task "${task.name}" (normalized: "${normalizedDependencyName}")`);
            }
          }
        }
      }

      console.log(`Successfully created ${hierarchiesCreated.length} hierarchical relationships`);

      // Step 3: Return success response
      res.status(201).json({
        message: `Successfully created ${createdTasks.length} tasks with ${hierarchiesCreated.length} hierarchical relationships`,
        tasksCreated: createdTasks.length,
        hierarchiesCreated: hierarchiesCreated.length,
        tasks: createdTasks.map(t => ({ id: t.id, name: t.name, type: t.type }))
      });

      // Step 4: Broadcast events to WebSocket clients
      broadcastToUser(req.user.id, { 
        type: 'tasks_bulk_created', 
        data: { 
          tasksCreated: createdTasks.length,
          hierarchiesCreated: hierarchiesCreated.length
        }
      });

    } catch (error) {
      console.error("Error in bulk task creation:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create tasks in bulk";
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

  // Task Hierarchy Routes
  app.get('/api/tasks/:id/hierarchy', isAuthenticated, async (req: any, res) => {
    try {
      // Verify task ownership
      const task = await storage.getTask(req.params.id, req.user.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const hierarchy = await storage.getTaskHierarchy(req.params.id, req.user.id);
      res.json(hierarchy);
    } catch (error) {
      console.error("Error fetching task hierarchy:", error);
      res.status(500).json({ message: "Failed to fetch task hierarchy" });
    }
  });

  app.post('/api/task-hierarchy', isAuthenticated, async (req: any, res) => {
    try {
      const hierarchyData = insertTaskHierarchySchema.parse(req.body);
      
      // Verify both tasks exist and belong to user
      const parentTask = await storage.getTask(hierarchyData.parentTaskId, req.user.id);
      const childTask = await storage.getTask(hierarchyData.childTaskId, req.user.id);
      
      if (!parentTask) {
        return res.status(404).json({ message: "Parent task not found" });
      }
      if (!childTask) {
        return res.status(404).json({ message: "Child task not found" });
      }
      
      // Prevent self-reference
      if (hierarchyData.parentTaskId === hierarchyData.childTaskId) {
        return res.status(400).json({ message: "Task cannot be parent of itself" });
      }
      
      const hierarchy = await storage.createTaskHierarchy(hierarchyData, req.user.id);
      res.status(201).json(hierarchy);
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'hierarchy_created', data: hierarchy });
    } catch (error) {
      console.error("Error creating task hierarchy:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create task hierarchy";
      
      // Map specific errors to appropriate status codes
      if (errorMessage.includes("not found or access denied")) {
        res.status(404).json({ message: errorMessage });
      } else if (errorMessage.includes("already exists")) {
        res.status(409).json({ message: errorMessage });
      } else if (errorMessage.includes("cycle")) {
        res.status(400).json({ message: errorMessage });
      } else {
        res.status(400).json({ message: errorMessage });
      }
    }
  });

  app.patch('/api/task-hierarchy/:id', isAuthenticated, async (req: any, res) => {
    try {
      const updateSchema = z.object({
        sequence: z.number().int().positive().nullable().optional()
      });
      
      const updates = updateSchema.parse(req.body);
      const hierarchy = await storage.updateTaskHierarchy(req.params.id, req.user.id, updates);
      res.json(hierarchy);
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'hierarchy_updated', data: hierarchy });
    } catch (error) {
      console.error("Error updating task hierarchy:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update task hierarchy";
      
      // Map specific errors to appropriate status codes
      if (errorMessage.includes("not found")) {
        res.status(404).json({ message: errorMessage });
      } else if (errorMessage.includes("Unauthorized")) {
        res.status(403).json({ message: errorMessage });
      } else if (errorMessage.includes("already used") || errorMessage.startsWith("SEQUENCE_CONFLICT:")) {
        // Handle both old and new sequence conflict error formats
        const sequence = errorMessage.startsWith("SEQUENCE_CONFLICT:") ? errorMessage.split(':')[1] : "that";
        const message = `Sequence ${sequence} is already used by another subtask. Please choose a different number.`;
        res.status(409).json({ 
          message,
          code: 'SEQUENCE_CONFLICT'
        });
      } else {
        res.status(400).json({ message: errorMessage });
      }
    }
  });

  app.delete('/api/task-hierarchy/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteTaskHierarchy(req.params.id, req.user.id);
      res.status(204).send();
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'hierarchy_deleted', data: { id: req.params.id } });
    } catch (error) {
      console.error("Error deleting task hierarchy:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete task hierarchy";
      
      // Map specific errors to appropriate status codes
      if (errorMessage.includes("not found")) {
        res.status(404).json({ message: errorMessage });
      } else if (errorMessage.includes("Unauthorized")) {
        res.status(403).json({ message: errorMessage });
      } else {
        res.status(500).json({ message: errorMessage });
      }
    }
  });

  // Task Rollup Routes
  app.get('/api/tasks/:id/rollups', isAuthenticated, async (req: any, res) => {
    try {
      const taskWithRollups = await storage.getTaskWithRollups(req.params.id, req.user.id);
      res.json(taskWithRollups);
    } catch (error) {
      console.error("Error fetching task rollups:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch task rollups";
      
      if (errorMessage.includes("not found")) {
        res.status(404).json({ message: errorMessage });
      } else {
        res.status(500).json({ message: errorMessage });
      }
    }
  });

  app.get('/api/tasks/rollups', isAuthenticated, async (req: any, res) => {
    try {
      const tasksWithRollups = await storage.getTasksWithRollups(req.user.id);
      res.json(tasksWithRollups);
    } catch (error) {
      console.error("Error fetching tasks with rollups:", error);
      res.status(500).json({ message: "Failed to fetch tasks with rollups" });
    }
  });

  // Task Tree Structure Routes
  app.get('/api/tasks/tree', isAuthenticated, async (req: any, res) => {
    try {
      const tree = await storage.getTaskTree(req.user.id);
      
      // Convert Maps to Objects for JSON serialization
      const response = {
        tasks: Object.fromEntries(tree.tasks),
        children: Object.fromEntries(tree.children),
        parents: Object.fromEntries(tree.parents),
        hierarchies: Object.fromEntries(tree.hierarchies), // Include hierarchy data with sequence
        roots: tree.roots,
        leaves: tree.leaves
      };
      
      res.json(response);
    } catch (error) {
      console.error("Error fetching task tree:", error);
      res.status(500).json({ message: "Failed to fetch task tree" });
    }
  });

  app.get('/api/tasks/:id/path', isAuthenticated, async (req: any, res) => {
    try {
      const path = await storage.getTaskPath(req.params.id, req.user.id);
      res.json({ path });
    } catch (error) {
      console.error("Error fetching task path:", error);
      res.status(500).json({ message: "Failed to fetch task path" });
    }
  });

  app.get('/api/tasks/:id/ancestors', isAuthenticated, async (req: any, res) => {
    try {
      const ancestors = await storage.getTaskAncestors(req.params.id, req.user.id);
      res.json(ancestors);
    } catch (error) {
      console.error("Error fetching task ancestors:", error);
      res.status(500).json({ message: "Failed to fetch task ancestors" });
    }
  });

  app.get('/api/tasks/:id/descendants', isAuthenticated, async (req: any, res) => {
    try {
      const descendants = await storage.getTaskDescendants(req.params.id, req.user.id);
      res.json(descendants);
    } catch (error) {
      console.error("Error fetching task descendants:", error);
      res.status(500).json({ message: "Failed to fetch task descendants" });
    }
  });

  app.get('/api/tasks/:id/siblings', isAuthenticated, async (req: any, res) => {
    try {
      const siblings = await storage.getTaskSiblings(req.params.id, req.user.id);
      res.json(siblings);
    } catch (error) {
      console.error("Error fetching task siblings:", error);
      res.status(500).json({ message: "Failed to fetch task siblings" });
    }
  });

  // Planning Matrix Routes
  app.get('/api/planning/matrix', isAuthenticated, async (req: any, res) => {
    try {
      const tasks = await storage.getTasks(req.user.id);
      
      // Organize tasks by time horizon and category
      const matrix: Record<string, Record<string, any[]>> = {};
      const timeHorizons = ['VISION', '10 Year', '5 Year', '1 Year', 'Quarter', 'Month', 'Week', 'Today', 'BACKLOG'];
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
        newTimeHorizon: z.enum(["VISION", "10 Year", "5 Year", "1 Year", "Quarter", "Month", "Week", "Today", "BACKLOG"]).optional(),
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
      
      // If task is moved to BACKLOG, remove it from all daily schedules
      if (newTimeHorizon === 'BACKLOG') {
        try {
          await storage.removeTaskFromAllDailySchedules(taskId, req.user.id);
          console.log(`Removed task ${taskId} from all daily schedules due to BACKLOG move`);
        } catch (error) {
          console.error(`Failed to remove task ${taskId} from daily schedules:`, error);
        }
      }
      
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
  function parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  function mapStartTimeToCanonicalBlock(startTime: string): string {
    const startMinutes = parseTimeToMinutes(startTime);
    
    // Use centralized TIME_BLOCKS definition to ensure consistency
    for (const block of TIME_BLOCKS) {
      const blockStartMinutes = parseTimeToMinutes(block.start);
      const blockEndMinutes = parseTimeToMinutes(block.end);
      
      if (startMinutes >= blockStartMinutes && startMinutes < blockEndMinutes) {
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
  ): Array<{ date: Date; timeBlock: string; quartile: number; plannedTaskId?: string; status: 'not_started'; reflection?: string }> {
    const entries = [];
    
    // Log the structure for debugging
    console.log('AI Schedule structure:', JSON.stringify(aiSchedule, null, 2).substring(0, 500));
    
    // Track which time blocks have been processed to ensure all 10 are covered
    const processedBlocks = new Set<string>();
    
    // Handle array format (old local fallback format - deprecated)
    if (Array.isArray(aiSchedule.schedule)) {
      for (const block of aiSchedule.schedule) {
        processedBlocks.add(block.timeBlock);
        // Handle the quartiles array format from local scheduler
        if (block.quartiles && Array.isArray(block.quartiles)) {
          block.quartiles.forEach((q: any, index: number) => {
            if (q.task) {
              const taskId = q.task.id || resolveTaskIdByName(q.task.name, nameToId);
              entries.push({
                date,
                timeBlock: block.timeBlock,
                quartile: index + 1,
                plannedTaskId: taskId || null,
                status: 'not_started' as const
              });
            }
          });
        }
        // Handle other array formats
        else {
          let taskList = [];
          
          // Extract tasks from different possible structures
          if (block.tasks && Array.isArray(block.tasks)) {
            taskList = block.tasks;
          } else if (block.task && typeof block.task === 'object' && block.task.id) {
            // New format: single task object per time block
            taskList = [block.task];
          }
          
          // Create entries for up to 4 tasks per time block
          for (let i = 0; i < Math.min(taskList.length, 4); i++) {
            const task = taskList[i];
            const taskId = task.id || resolveTaskIdByName(task.name, nameToId);
            
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
    } 
    // Handle flat object format (current OpenAI response and new local fallback)
    else {
      // Filter out metadata keys like 'source', 'totalTasks'
      const scheduleData = aiSchedule.schedule || aiSchedule;
      
      // Process time block structure: timeBlock -> quartiles or timeBlock -> timeRange -> quartiles
      for (const [keyName, keyData] of Object.entries(scheduleData)) {
        if (keyName === 'source' || keyName === 'totalTasks' || !keyData || typeof keyData !== 'object') continue;
        
        let canonicalTimeBlockName: string;
        let timeBlockData: any;
        
        // Check if this is a time-range key like "17:00-19:00"
        const timeRangeMatch = keyName.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
        if (timeRangeMatch) {
          // Map the start time to canonical time block
          canonicalTimeBlockName = mapStartTimeToCanonicalBlock(timeRangeMatch[1]);
          timeBlockData = keyData;
          console.log(`Mapped time range ${keyName} to canonical block: ${canonicalTimeBlockName}`);
        } else {
          // Assume it's already a canonical time block name
          canonicalTimeBlockName = keyName;
          timeBlockData = keyData;
        }
        
        // Track that we're processing this canonical time block
        processedBlocks.add(canonicalTimeBlockName);
        
        // Extract the base time block name (remove time range in parentheses)
        const baseTimeBlockName = canonicalTimeBlockName.replace(/\s*\([^)]*\)/g, '').trim();
        
        // Check if this has a nested time range structure
        const firstKey = Object.keys(timeBlockData)[0];
        const isNestedTimeRange = firstKey && firstKey.includes(':');
        
        if (isNestedTimeRange) {
          // Handle nested structure: PHYSICAL MENTAL -> 7:00-9:00 -> Q1, Q2, etc.
          for (const [timeRange, quartiles] of Object.entries(timeBlockData)) {
            if (!quartiles || typeof quartiles !== 'object') continue;
            
            // Process each quartile
            for (const [quartileKey, tasks] of Object.entries(quartiles as any)) {
              let quartileNum: number;
              
              if (quartileKey.startsWith('Q')) {
                // Format: Q1, Q2, Q3, Q4
                quartileNum = parseInt(quartileKey.substring(1));
              } else if (quartileKey.startsWith('Quarter ')) {
                // Format: Quarter 1, Quarter 2, Quarter 3, Quarter 4
                quartileNum = parseInt(quartileKey.substring(8));
              } else {
                continue;
              }
              
              if (isNaN(quartileNum) || quartileNum < 1 || quartileNum > 4) continue;
              
              // Handle different task formats with multiple task support
              let taskData = tasks as any;
              let taskId: string | undefined;
              let taskNames: string[] = [];
              
              if (Array.isArray(taskData) && taskData.length > 0) {
                // Multiple tasks - collect all names and use first for primary ID
                taskData.forEach((t: any, index: number) => {
                  let taskName: string | undefined;
                  if (typeof t === 'string') {
                    taskName = t;
                    if (index === 0) taskId = resolveTaskIdByName(t, nameToId);
                  } else if (t && typeof t === 'object') {
                    taskName = t.taskName || t.name;
                    if (index === 0) {
                      taskId = t.id || (taskName ? resolveTaskIdByName(taskName, nameToId) : undefined);
                    }
                  }
                  if (taskName) taskNames.push(taskName);
                });
              } else if (taskData) {
                // Single task
                if (typeof taskData === 'string') {
                  taskId = resolveTaskIdByName(taskData, nameToId);
                  taskNames.push(taskData);
                } else if (typeof taskData === 'object') {
                  const taskName = taskData.taskName || taskData.name;
                  taskId = taskData.id || resolveTaskIdByName(taskName, nameToId);
                  if (taskName) taskNames.push(taskName);
                }
              }
              
              // Create entry
              const entry: any = {
                date,
                timeBlock: baseTimeBlockName,
                quartile: quartileNum,
                plannedTaskId: taskId || null,
                status: 'not_started' as const
              };
              
              // Store multiple task names in reflection if more than one
              if (taskNames.length > 1) {
                entry.reflection = `MULTIPLE_TASKS:${taskNames.join('|')}`;
              } else if (taskNames.length === 1 && !taskId) {
                entry.reflection = `RECURRING_TASK:${taskNames[0]}`;
              }
              
              entries.push(entry);
          }
        }
        } else {
          // Handle direct quartile structure without time range nesting
          for (const [quartileKey, tasks] of Object.entries(timeBlockData as any)) {
            let quartileNum: number;
            
            if (quartileKey.startsWith('Q')) {
              // Format: Q1, Q2, Q3, Q4
              quartileNum = parseInt(quartileKey.substring(1));
            } else if (quartileKey.startsWith('Quarter ')) {
              // Format: Quarter 1, Quarter 2, Quarter 3, Quarter 4
              quartileNum = parseInt(quartileKey.substring(8));
            } else {
              continue;
            }
            
            if (isNaN(quartileNum) || quartileNum < 1 || quartileNum > 4) continue;
            
            // Handle different task formats with multiple task support
            let taskData = tasks as any;
            let taskId: string | undefined;
            let taskNames: string[] = [];
            
            if (Array.isArray(taskData) && taskData.length > 0) {
              // Multiple tasks - collect all names and use first for primary ID
              taskData.forEach((t: any, index: number) => {
                let taskName: string | undefined;
                if (typeof t === 'string') {
                  taskName = t;
                  if (index === 0) taskId = resolveTaskIdByName(t, nameToId);
                } else if (t && typeof t === 'object') {
                  taskName = t.taskName || t.name;
                  if (index === 0) {
                    taskId = t.id || (taskName ? resolveTaskIdByName(taskName, nameToId) : undefined);
                  }
                }
                if (taskName) taskNames.push(taskName);
              });
            } else if (taskData) {
              // Single task
              if (typeof taskData === 'string') {
                taskId = resolveTaskIdByName(taskData, nameToId);
                taskNames.push(taskData);
              } else if (typeof taskData === 'object') {
                const taskName = taskData.taskName || taskData.name;
                taskId = taskData.id || resolveTaskIdByName(taskName, nameToId);
                if (taskName) taskNames.push(taskName);
              }
            }
            
            // Create entry
            const entry: any = {
              date,
              timeBlock: baseTimeBlockName,
              quartile: quartileNum,
              plannedTaskId: taskId || null,
              status: 'not_started' as const
            };
            
            // Store multiple task names in reflection if more than one
            if (taskNames.length > 1) {
              entry.reflection = `MULTIPLE_TASKS:${taskNames.join('|')}`;
            } else if (taskNames.length === 1 && !taskId) {
              entry.reflection = `RECURRING_TASK:${taskNames[0]}`;
            }
            
            entries.push(entry);
          }
        }
      }
    }
    
    // DEFINITIVE 40-QUARTILE GUARANTEE: Final reconciliation pass
    
    // Step 1: Dedupe entries (keep first occurrence of each block+quartile combination)
    const seenBlockQuartiles = new Set<string>();
    const dedupedEntries = [];
    
    for (const entry of entries) {
      const key = `${entry.timeBlock}:${entry.quartile}`;
      if (!seenBlockQuartiles.has(key)) {
        seenBlockQuartiles.add(key);
        dedupedEntries.push(entry);
      }
    }
    
    // Step 2: Build comprehensive coverage map 
    const finalEntries = [...dedupedEntries];
    const blockQuartileMap = new Map<string, Set<number>>();
    
    // Track existing quartiles per block
    finalEntries.forEach(entry => {
      if (!blockQuartileMap.has(entry.timeBlock)) {
        blockQuartileMap.set(entry.timeBlock, new Set());
      }
      blockQuartileMap.get(entry.timeBlock)!.add(entry.quartile);
    });
    
    // Step 3: Ensure ALL 10 TIME_BLOCKS have ALL 4 quartiles (guaranteed 40 entries)
    for (const timeBlock of TIME_BLOCKS) {
      const existingQuartiles = blockQuartileMap.get(timeBlock.name) || new Set();
      
      // Fill missing quartiles for this time block
      for (let quartile = 1; quartile <= 4; quartile++) {
        if (!existingQuartiles.has(quartile)) {
          // Create empty entry without placeholder task name
          finalEntries.push({
            date,
            timeBlock: timeBlock.name,
            quartile,
            plannedTaskId: null,
            status: 'not_started' as const,
            reflection: null
          });
        }
      }
    }
    
    // Override original entries with guaranteed complete set
    entries.length = 0;
    entries.push(...finalEntries);
    
    // Final validation: ensure exactly 40 entries (10 blocks × 4 quartiles)
    if (entries.length !== 40) {
      console.warn(`Schedule normalization produced ${entries.length} entries instead of expected 40!`);
      // Group by time block for debugging
      const blockCounts = new Map<string, number>();
      entries.forEach(entry => {
        blockCounts.set(entry.timeBlock, (blockCounts.get(entry.timeBlock) || 0) + 1);
      });
      console.warn('Entries per time block:', Array.from(blockCounts.entries()));
    } else {
      console.log(`Successfully normalized schedule to exactly ${entries.length} entries (complete 40-quartile coverage)`);
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
      
      // PRESERVE RECURRING TASKS: Fetch existing schedule to identify recurring task slots
      const scheduleDate = new Date(date);
      const existingSchedule = await storage.getDailySchedule(userId, scheduleDate);
      
      // Identify which slots are occupied by recurring tasks (marked with RECURRING_TASK: prefix)
      const recurringSlots = new Set<string>();
      const preservedRecurringEntries: any[] = [];
      
      existingSchedule.forEach(entry => {
        if (entry.reflection && entry.reflection.startsWith('RECURRING_TASK:')) {
          const slotKey = `${entry.timeBlock}:${entry.quartile}`;
          recurringSlots.add(slotKey);
          preservedRecurringEntries.push({
            date: entry.date,
            timeBlock: entry.timeBlock,
            quartile: entry.quartile,
            plannedTaskId: entry.plannedTaskId || null,
            status: entry.status,
            reflection: entry.reflection,
            energyImpact: entry.energyImpact || 0
          });
        }
      });
      
      console.log(`Preserving ${preservedRecurringEntries.length} recurring task slots:`, 
        Array.from(recurringSlots));
      
      // Get available tasks and recurring tasks with instrumentation
      console.time('fetch_tasks');
      const tasks = await storage.getTasks(userId, { 
        status: ['not_started', 'in_progress'],
      });
      console.timeEnd('fetch_tasks');
      
      // Note: Recurring tasks are now handled by "Sync to Daily" functionality
      // AI Schedule generation now focuses only on regular tasks for better optimization
      console.log('DEBUG: Skipping recurring tasks - using regular tasks only for AI optimization');
      
      // Get user preferences (you might want to store these in user profile)
      const userPreferences = {
        workHours: { start: "9:00", end: "17:00" },
        energyPatterns: {}
      };
      
      // Filter out parent tasks using hierarchy validation (comprehensive leaf-only filtering)
      const taskTree = await storage.getTaskTree(req.user.id);
      const tasksForScheduling = tasks.filter(task => {
        // Exclude Milestones and Sub-Milestones (legacy type-based filtering)
        if (task.type === 'Milestone' || task.type === 'Sub-Milestone') {
          return false;
        }
        // Exclude any task that has children (hierarchy-based leaf-only filtering)
        const children = taskTree?.children?.get(task.id) || [];
        const hasChildren = Array.isArray(children) ? children.length > 0 : false;
        return !hasChildren;
      });

      console.time('generate_schedule');
      // Pass empty array for recurring tasks since they're handled by "Sync to Daily"
      // Also pass the occupied slots so AI knows which slots to avoid
      const aiSchedule = await generateDailySchedule(
        tasksForScheduling, 
        [], 
        userPreferences,
        recurringSlots
      );
      console.timeEnd('generate_schedule');
      
      // Build task name index for name→ID lookup (only from schedulable tasks)
      const nameToId = new Map<string, string>();
      tasksForScheduling.forEach(task => {
        nameToId.set(task.name.toLowerCase().trim(), task.id);
      });
      
      // Normalize AI schedule to database entries
      const scheduleEntries = normalizeAIScheduleToEntries(aiSchedule, scheduleDate, nameToId);
      
      // Final guard: Filter out any entries that reference Milestone or Sub-Milestone tasks
      // This ensures no Milestones can slip through via direct ID references
      const allowedIdSet = new Set(tasksForScheduling.map(task => task.id));
      const filteredScheduleEntries = scheduleEntries.filter(entry => 
        // Allow entries with no task ID (recurring tasks) or valid task IDs
        !entry.plannedTaskId || allowedIdSet.has(entry.plannedTaskId)
      );
      
      // MERGE: Combine preserved recurring entries with AI-generated entries
      // Remove AI entries that conflict with recurring slots
      const nonConflictingEntries = filteredScheduleEntries.filter(entry => {
        const slotKey = `${entry.timeBlock}:${entry.quartile}`;
        return !recurringSlots.has(slotKey);
      });
      
      const finalEntries = [...preservedRecurringEntries, ...nonConflictingEntries];
      
      // Clear existing schedule for this date and save merged entries
      if (finalEntries.length > 0) {
        console.log(`Saving ${finalEntries.length} schedule entries (${preservedRecurringEntries.length} recurring + ${nonConflictingEntries.length} AI-generated) for ${date}`);
        await storage.clearDailySchedule(userId, scheduleDate);
        await storage.createDailyScheduleEntries(userId, finalEntries);
      }
      
      res.json(aiSchedule);
    } catch (error) {
      console.error("Error generating daily schedule:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate daily schedule";
      res.status(500).json({ message: errorMessage });
    }
  });

  // Create individual daily schedule entry
  app.post('/api/daily', isAuthenticated, async (req: any, res) => {
    try {
      const parsedData = {
        ...req.body,
        userId: req.user.id,
        date: new Date(req.body.xDate || req.body.date)
      };
      
      // LEAF-ONLY SCHEDULING VALIDATION: Prevent scheduling parent tasks
      const taskIdsToValidate = [];
      if (parsedData.plannedTaskId) taskIdsToValidate.push(parsedData.plannedTaskId);
      if (parsedData.actualTaskId) taskIdsToValidate.push(parsedData.actualTaskId);
      
      if (taskIdsToValidate.length > 0) {
        // Get task hierarchy once per request for efficiency
        const taskTree = await storage.getTaskTree(req.user.id);
        
        for (const taskId of taskIdsToValidate) {
          // Verify task exists and belongs to user (ownership validation)
          const task = await storage.getTask(taskId, req.user.id);
          if (!task) {
            return res.status(404).json({ message: `Task not found or access denied: ${taskId}` });
          }
          
          // Check if this task has children (hierarchy validation)
          const children = taskTree?.children?.get(taskId) || [];
          const hasChildren = Array.isArray(children) ? children.length > 0 : false;
          if (hasChildren) {
            return res.status(400).json({ 
              message: `Cannot schedule parent task "${task.name}". Only leaf tasks (tasks without children) can be scheduled. Please schedule the individual subtasks instead.` 
            });
          }
        }
      }
      
      const scheduleData = insertDailyScheduleSchema.parse(parsedData);
      const entry = await storage.createDailyScheduleEntry({
        ...scheduleData,
        userId: req.user.id
      });
      res.json(entry);
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'schedule_created', data: entry });
    } catch (error) {
      console.error("Error creating daily schedule entry:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create schedule entry";
      res.status(400).json({ message: errorMessage });
    }
  });

  app.put('/api/daily/update', isAuthenticated, async (req: any, res) => {
    try {
      const { id, ...updates } = req.body;
      
      // Fetch existing entry to validate cross-field consistency
      const existingEntry = await storage.getDailyScheduleEntry(id, req.user.id);
      if (!existingEntry) {
        return res.status(404).json({ message: "Schedule entry not found" });
      }
      
      // Merge updates with existing data
      const mergedData = {
        date: existingEntry.date,
        timeBlock: existingEntry.timeBlock,
        quartile: existingEntry.quartile,
        plannedTaskId: existingEntry.plannedTaskId,
        actualTaskId: existingEntry.actualTaskId,
        status: existingEntry.status,
        energyImpact: existingEntry.energyImpact,
        reflection: existingEntry.reflection,
        startTime: existingEntry.startTime,
        endTime: existingEntry.endTime,
        ...updates
      };
      
      // LEAF-ONLY SCHEDULING VALIDATION: Prevent scheduling parent tasks
      const taskIdsToValidate = [];
      if (mergedData.plannedTaskId) taskIdsToValidate.push(mergedData.plannedTaskId);
      if (mergedData.actualTaskId) taskIdsToValidate.push(mergedData.actualTaskId);
      
      if (taskIdsToValidate.length > 0) {
        // Get task hierarchy once per request for efficiency
        const taskTree = await storage.getTaskTree(req.user.id);
        
        for (const taskId of taskIdsToValidate) {
          // Verify task exists and belongs to user (ownership validation)
          const task = await storage.getTask(taskId, req.user.id);
          if (!task) {
            return res.status(404).json({ message: `Task not found or access denied: ${taskId}` });
          }
          
          // Check if this task has children (hierarchy validation)
          const children = taskTree?.children?.get(taskId) || [];
          const hasChildren = Array.isArray(children) ? children.length > 0 : false;
          if (hasChildren) {
            return res.status(400).json({ 
              message: `Cannot schedule parent task "${task.name}". Only leaf tasks (tasks without children) can be scheduled. Please schedule the individual subtasks instead.` 
            });
          }
        }
      }
      
      // Validate the merged data using full schema validation
      const scheduleData = insertDailyScheduleSchema.parse(mergedData);
      const entry = await storage.updateDailyScheduleEntry(id, req.user.id, scheduleData);
      res.json(entry);
      
      // Broadcast to WebSocket clients for real-time sync
      broadcastToUser(req.user.id, { type: 'daily_schedule_updated', data: entry });
    } catch (error) {
      console.error("Error updating daily schedule:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update schedule";
      res.status(400).json({ message: errorMessage });
    }
  });

  app.delete('/api/daily/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Verify the entry exists and belongs to the user
      const existingEntry = await storage.getDailyScheduleEntry(id, req.user.id);
      if (!existingEntry) {
        return res.status(404).json({ message: "Schedule entry not found" });
      }
      
      await storage.deleteDailyScheduleEntry(id, req.user.id);
      res.status(204).send();
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'schedule_entry_deleted', data: { id } });
    } catch (error) {
      console.error("Error deleting daily schedule entry:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete schedule entry";
      res.status(500).json({ message: errorMessage });
    }
  });

  app.get('/api/daily/completed/all', isAuthenticated, async (req: any, res) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
      const completedEntries = await storage.getCompletedDailyScheduleEntries(req.user.id, startDate, endDate);
      res.json(completedEntries);
    } catch (error) {
      console.error("Error fetching completed daily schedule entries:", error);
      res.status(500).json({ message: "Failed to fetch completed daily schedule entries" });
    }
  });

  // Manual add task to existing quarter (converts to MULTIPLE_TASKS format)
  app.post('/api/daily/add-to-quarter', isAuthenticated, async (req: any, res) => {
    try {
      const { timeBlock, quartile, taskId, date } = req.body;
      
      console.log(`[ADD TO QUARTER] Adding task ${taskId} to ${timeBlock} Q${quartile} on ${date}`);
      
      // Validate inputs
      if (!timeBlock || !taskId || !date) {
        return res.status(400).json({ message: "Missing required fields: timeBlock, quartile, taskId, date" });
      }
      
      // Validate quartile is a valid number between 1-4
      const quartileNum = parseInt(String(quartile), 10);
      if (isNaN(quartileNum) || quartileNum < 1 || quartileNum > 4) {
        return res.status(400).json({ message: "Quartile must be a number between 1 and 4" });
      }

      // Get the task being added
      const task = await storage.getTask(taskId, req.user.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const targetDate = new Date(date);
      
      // Find existing schedule entry for this quarter
      const existingSchedules = await storage.getDailySchedule(req.user.id, targetDate);
      const existingEntry = existingSchedules.find(s => s.timeBlock === timeBlock && s.quartile === quartileNum);
      
      if (!existingEntry) {
        // No existing entry - create new one with this task
        console.log(`[ADD TO QUARTER] Creating new entry for ${timeBlock} Q${quartileNum}`);
        const newEntry = await storage.createDailyScheduleEntry({
          userId: req.user.id,
          date: targetDate,
          timeBlock,
          quartile: quartileNum,
          plannedTaskId: taskId,
          status: 'not_started',
          reflection: null
        });
        
        res.json(newEntry);
        broadcastToUser(req.user.id, { type: 'schedule_created', data: newEntry });
        return;
      }

      // Existing entry found - check if it's a placeholder first
      if (existingEntry.reflection?.startsWith('PLACEHOLDER:')) {
        console.log(`[ADD TO QUARTER] Existing entry is a placeholder, replacing with new task`);
        const updatedEntry = await storage.updateDailyScheduleEntry(existingEntry.id, req.user.id, {
          plannedTaskId: taskId,
          reflection: null
        });
        
        res.json(updatedEntry);
        broadcastToUser(req.user.id, { type: 'schedule_updated', data: updatedEntry });
        return;
      }

      // Existing entry found - need to combine tasks
      console.log(`[ADD TO QUARTER] Found existing entry, combining tasks`);
      let newReflection: string;
      
      if (existingEntry.reflection?.startsWith('MULTIPLE_TASKS:')) {
        // Already has multiple tasks - add to the list (avoid duplicates)
        const existingTasks = existingEntry.reflection.replace('MULTIPLE_TASKS:', '');
        const taskNames = existingTasks.split('|').map(name => name.trim());
        
        // Only add if not already present (case-insensitive, normalized whitespace)
        const normalizeTaskName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
        const normalizedTaskName = normalizeTaskName(task.name);
        const normalizedTaskNames = taskNames.map(name => normalizeTaskName(name));
        
        if (!normalizedTaskNames.includes(normalizedTaskName)) {
          newReflection = `MULTIPLE_TASKS:${existingTasks}|${task.name}`;
          console.log(`[ADD TO QUARTER] Adding to existing multiple tasks: ${newReflection}`);
        } else {
          console.log(`[ADD TO QUARTER] Task ${task.name} already exists in multiple tasks, skipping`);
          return res.status(409).json({ message: "Task already exists in this quarter" });
        }
      } else if (existingEntry.reflection?.startsWith('RECURRING_TASK:')) {
        // Has a single recurring task - convert to multiple
        const existingTask = existingEntry.reflection.replace('RECURRING_TASK:', '');
        // Check normalized names for better duplicate detection
        const normalizeTaskName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
        if (normalizeTaskName(existingTask) !== normalizeTaskName(task.name)) {
          newReflection = `MULTIPLE_TASKS:${existingTask}|${task.name}`;
          console.log(`[ADD TO QUARTER] Converting single recurring to multiple: ${newReflection}`);
        } else {
          console.log(`[ADD TO QUARTER] Task ${task.name} already exists as recurring task, skipping`);
          return res.status(409).json({ message: "Task already exists in this quarter" });
        }
      } else if (existingEntry.plannedTaskId || existingEntry.actualTaskId) {
        // Has a regular planned/actual task - get its name and combine
        const existingTaskId = existingEntry.actualTaskId || existingEntry.plannedTaskId;
        if (existingTaskId) {
          // Check if it's the same task
          if (existingTaskId === taskId) {
            console.log(`[ADD TO QUARTER] Task ${task.name} already exists as planned/actual task, skipping`);
            return res.status(409).json({ message: "Task already exists in this quarter" });
          }
          
          const existingTask = await storage.getTask(existingTaskId, req.user.id);
          if (existingTask) {
            // Check if the task names match (case-insensitive, normalized)
            const normalizeTaskName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
            if (normalizeTaskName(existingTask.name) === normalizeTaskName(task.name)) {
              console.log(`[ADD TO QUARTER] Task ${task.name} already exists as planned/actual task (same normalized name), skipping`);
              return res.status(409).json({ message: "Task already exists in this quarter" });
            }
            
            newReflection = `MULTIPLE_TASKS:${existingTask.name}|${task.name}`;
            console.log(`[ADD TO QUARTER] Converting single regular task to multiple: ${newReflection}`);
          } else {
            // Existing task fetch failed - still need to check for name-based duplicates against the new task
            // Since we can't get the existing task name, we have to be conservative and allow the addition
            // but this is an edge case that should be rare
            console.log(`[ADD TO QUARTER] Existing task fetch failed for ID ${existingTaskId}, proceeding with caution`);
            newReflection = `MULTIPLE_TASKS:Unknown Task|${task.name}`;
            console.log(`[ADD TO QUARTER] Creating multiple tasks with unknown existing task: ${newReflection}`);
          }
        } else {
          newReflection = `MULTIPLE_TASKS:${task.name}`;
          console.log(`[ADD TO QUARTER] No existing task ID, creating new multiple tasks: ${newReflection}`);
        }
      } else {
        // Empty entry - just add the new task
        newReflection = `MULTIPLE_TASKS:${task.name}`;
        console.log(`[ADD TO QUARTER] Empty entry, creating new multiple tasks: ${newReflection}`);
      }
      
      // Update the existing entry with the new reflection
      const updatedEntry = await storage.updateDailyScheduleEntry(existingEntry.id, req.user.id, {
        reflection: newReflection
      });
      
      console.log(`[ADD TO QUARTER] Successfully updated entry with multiple tasks`);
      res.json(updatedEntry);
      broadcastToUser(req.user.id, { type: 'schedule_updated', data: updatedEntry });
      
    } catch (error) {
      console.error("Error adding task to quarter:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add task to quarter";
      res.status(500).json({ message: errorMessage });
    }
  });

  // Clear daily schedule endpoint
  app.post('/api/daily/clear/:date', isAuthenticated, async (req: any, res) => {
    try {
      const dateParam = req.params.date;
      
      // Validate date parameter
      if (!dateParam) {
        return res.status(400).json({ message: "Date parameter is required" });
      }
      
      const date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      
      await storage.clearDailySchedule(req.user.id, date);
      res.json({ message: "Daily schedule cleared successfully" });
      
      // Broadcast to WebSocket clients
      broadcastToUser(req.user.id, { type: 'schedule_cleared', data: { date: dateParam } });
    } catch (error) {
      console.error("Error clearing daily schedule:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to clear schedule";
      res.status(500).json({ message: errorMessage });
    }
  });

  // AI Integration Routes
  app.post('/api/ai/chat', isAuthenticated, async (req: any, res) => {
    try {
      const { message } = req.body;
      
      // Get context data
      const tasks = await storage.getTasks(req.user.id);
      const context = { tasks };
      
      const aiResponse = await processAICommand(message.trim(), context);
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
            console.log(`Processing image file: ${file.originalname}, type: ${mimeType}, size: ${fileBuffer.length} bytes`);
            const base64Image = fileBuffer.toString('base64');
            const imageTasks = await analyzeImage(base64Image, mimeType);
            console.log(`Image analysis returned ${imageTasks.length} tasks:`, imageTasks);
            
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

      // Even if no tasks found, return success with empty array
      // This is better UX than showing an error
      if (tasks.length === 0) {
        console.log('No tasks extracted from content/files - returning empty array');
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
      
      const aiResponse = await processRecurringTaskChatCommand(message, chatContext);
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

  // Skip recurring task for a specific date
  app.post('/api/recurring/schedule/:id/skip', isAuthenticated, async (req: any, res) => {
    try {
      const skipData = z.object({
        date: z.string().datetime()
      }).parse(req.body);
      
      const skip = await storage.createTaskSkip({
        recurringScheduleId: req.params.id,
        skipDate: new Date(skipData.date)
      }, req.user.id);
      
      res.status(201).json(skip);
    } catch (error) {
      console.error("Error creating task skip:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create task skip";
      res.status(400).json({ message: errorMessage });
    }
  });

  // Sync Recurring Tasks to Daily Schedule (Rebuild Mode)
  app.post('/api/recurring/sync-to-daily', isAuthenticated, async (req: any, res) => {
    try {
      const syncSchema = z.object({
        targetDate: z.string().optional().default(new Date().toISOString().slice(0, 10)),
        dryRun: z.boolean().optional().default(false)
      });

      const { targetDate, dryRun } = syncSchema.parse(req.body);
      const baseline = new Date(targetDate);
      
      // Get all active recurring tasks for the user
      const recurringTasks = await storage.getRecurringTasks(req.user.id);
      console.log(`[SYNC DEBUG] Found ${recurringTasks.length} recurring tasks for user ${req.user.id}`);
      
      let createdTasks = 0;
      let createdSchedules = 0;
      let skipped = 0;
      const conflicts: Array<{
        recurringTaskId: string;
        taskName: string;
        date: string;
        timeBlock: string;
        requestedQuartile: number;
        reason: string;
      }> = [];

      // Helper function to calculate next occurrence date (includes TODAY if it matches)
      const getNextOccurrenceDate = (baseline: Date, targetDayName: string): Date => {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const baselineDay = baseline.getDay(); // 0=Sunday, 1=Monday, etc.
        const targetDay = dayNames.indexOf(targetDayName.toLowerCase());
        
        if (targetDay === -1) {
          throw new Error(`Invalid day name: ${targetDayName}`);
        }
        
        // Calculate days until next occurrence (include TODAY if it matches)
        let daysUntil = targetDay - baselineDay;
        if (daysUntil < 0) {
          daysUntil += 7; // Next week
        }
        // If daysUntil === 0, it's today - include it!
        
        const nextDate = new Date(baseline);
        nextDate.setDate(baseline.getDate() + daysUntil);
        nextDate.setHours(0, 0, 0, 0); // Start of day
        return nextDate;
      };

      // Helper function to check if a time block has already passed
      const hasTimeBlockPassed = (date: Date, timeBlockName: string): boolean => {
        const now = new Date();
        
        // Only check if it's today
        if (date.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)) {
          return false; // Future dates haven't passed
        }
        
        // Find the time block details
        const block = TIME_BLOCKS.find(b => 
          b.name.toUpperCase() === timeBlockName.toUpperCase() ||
          b.name.toUpperCase().includes(timeBlockName.toUpperCase()) ||
          timeBlockName.toUpperCase().includes(b.name.toUpperCase())
        );
        
        if (!block) {
          return false; // Unknown block, don't skip
        }
        
        // Parse the end time (format: "HH:MM")
        const [endHour, endMinute] = block.end.split(':').map(Number);
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Block has passed if current time is after the block's end time
        if (currentHour > endHour) {
          return true;
        }
        if (currentHour === endHour && currentMinute >= endMinute) {
          return true;
        }
        
        return false;
      };

      // Helper function to find valid time block
      const findTimeBlock = (timeBlockName: string): { name: string } | null => {
        const normalizedName = timeBlockName.toUpperCase();
        return TIME_BLOCKS.find(block => 
          block.name.toUpperCase() === normalizedName ||
          block.name.toUpperCase().includes(normalizedName) ||
          normalizedName.includes(block.name.toUpperCase())
        ) || null;
      };

      // Process each recurring task
      for (const recurringTask of recurringTasks) {
        console.log(`[SYNC DEBUG] Processing recurring task: ${recurringTask.taskName} (type: ${recurringTask.taskType})`);
        // Skip non-Task types (Milestones, Sub-Milestones)
        if (recurringTask.taskType !== 'Task') {
          console.log(`[SYNC DEBUG] Skipping ${recurringTask.taskName} - not a Task type`);
          continue;
        }

        // Find matching time block
        const timeBlock = findTimeBlock(recurringTask.timeBlock);
        if (!timeBlock) {
          console.log(`[SYNC DEBUG] Invalid time block for ${recurringTask.taskName}: ${recurringTask.timeBlock}`);
          conflicts.push({
            recurringTaskId: recurringTask.id,
            taskName: recurringTask.taskName,
            date: '',
            timeBlock: recurringTask.timeBlock,
            requestedQuartile: recurringTask.quarter || 1,
            reason: `Invalid time block: ${recurringTask.timeBlock}`
          });
          skipped++;
          continue;
        }
        console.log(`[SYNC DEBUG] Found time block for ${recurringTask.taskName}: ${timeBlock.name}`);
        console.log(`[SYNC DEBUG] Days of week: ${JSON.stringify(recurringTask.daysOfWeek)}`);
        
        if (!recurringTask.daysOfWeek || recurringTask.daysOfWeek.length === 0) {
          console.log(`[SYNC DEBUG] No days of week for ${recurringTask.taskName}`);
          skipped++;
          continue;
        }

        // Process each day of the week for this task
        for (const dayName of recurringTask.daysOfWeek) {
          try {
            const targetDate = getNextOccurrenceDate(baseline, dayName);
            const dateStr = targetDate.toISOString().slice(0, 10);

            // Skip if the entire date is in the past
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            if (dateStr < todayStr) {
              console.log(`[SYNC DEBUG] Skipping ${recurringTask.taskName} - date ${dateStr} is in the past (today is ${todayStr})`);
              skipped++;
              continue;
            }

            // Skip if this time block has already passed today
            if (hasTimeBlockPassed(targetDate, timeBlock.name)) {
              console.log(`[SYNC DEBUG] Skipping ${recurringTask.taskName} - time block ${timeBlock.name} has already passed on ${dateStr}`);
              skipped++;
              continue;
            }

            // Check for existing Task with same name and date
            const existingTasks = await storage.getTasks(req.user.id);
            const existingTask = existingTasks.find(task => 
              task.name === recurringTask.taskName && 
              task.xDate && 
              new Date(task.xDate).toISOString().slice(0, 10) === dateStr
            );

            let taskId: string;
            if (existingTask) {
              console.log(`[SYNC DEBUG] Found existing task for ${recurringTask.taskName} on ${dateStr}: ${existingTask.id}`);
              taskId = existingTask.id;
            } else if (!dryRun) {
              console.log(`[SYNC DEBUG] Creating new task for ${recurringTask.taskName} on ${dateStr}`);
              try {
                // Create new Task entry
                const newTask = await storage.createTask({
                  userId: req.user.id,
                  name: recurringTask.taskName,
                  type: recurringTask.taskType,
                  category: recurringTask.category,
                  subcategory: recurringTask.subcategory,
                  priority: recurringTask.priority,
                  estimatedTime: recurringTask.durationMinutes / 60,
                  status: 'not_started',
                  xDate: targetDate,
                  description: `Recurring: ${recurringTask.id} - ${recurringTask.description || ''}`.trim(),
                  timeHorizon: 'Week',
                  actualTime: null,
                  caloriesIntake: null,
                  caloriesExpenditure: null,
                  dueDate: null
                });
                taskId = newTask.id;
                createdTasks++;
                console.log(`[SYNC DEBUG] Created task: ${taskId} (total created: ${createdTasks})`);
              } catch (taskError) {
                console.error(`[SYNC ERROR] Failed to create task for ${recurringTask.taskName}:`, taskError);
                conflicts.push({
                  recurringTaskId: recurringTask.id,
                  taskName: recurringTask.taskName,
                  date: dateStr,
                  timeBlock: timeBlock.name,
                  requestedQuartile: recurringTask.quarter || 1,
                  reason: `Task creation failed: ${taskError instanceof Error ? taskError.message : 'Unknown error'}`
                });
                skipped++;
                continue;
              }
            } else {
              // Dry run - create placeholder ID
              taskId = 'dry-run-task-id';
              createdTasks++;
              console.log(`[SYNC DEBUG] Dry run - would create task for ${recurringTask.taskName} (total: ${createdTasks})`);
            }

            // Find available quarter in the time block or one that can fit multiple tasks
            const existingSchedules = await storage.getDailySchedule(req.user.id, targetDate);
            const blockSchedules = existingSchedules.filter(s => s.timeBlock === timeBlock.name);
            
            // Helper function to calculate total duration for tasks in a quarter
            const calculateQuarterDuration = async (scheduleEntry: any): Promise<number> => {
              let totalDuration = 0;
              
              if (scheduleEntry.plannedTaskId) {
                // Get duration from planned task
                const plannedTask = existingTasks.find(t => t.id === scheduleEntry.plannedTaskId);
                if (plannedTask && typeof plannedTask.estimatedTime === 'number') {
                  totalDuration += (plannedTask.estimatedTime * 60); // Convert hours to minutes
                }
              }
              
              if (scheduleEntry.reflection?.startsWith('MULTIPLE_TASKS:')) {
                // Parse multiple recurring tasks and sum their durations
                const taskNamesStr = scheduleEntry.reflection.replace('MULTIPLE_TASKS:', '');
                const taskNames = taskNamesStr.split('|');
                for (const taskName of taskNames) {
                  const recurringTaskMatch = recurringTasks.find(rt => rt.taskName.trim() === taskName.trim());
                  if (recurringTaskMatch) {
                    totalDuration += recurringTaskMatch.durationMinutes;
                  }
                }
              } else if (scheduleEntry.reflection?.startsWith('RECURRING_TASK:')) {
                // Single recurring task
                const taskName = scheduleEntry.reflection.replace('RECURRING_TASK:', '');
                const recurringTaskMatch = recurringTasks.find(rt => rt.taskName.trim() === taskName.trim());
                if (recurringTaskMatch) {
                  totalDuration += recurringTaskMatch.durationMinutes;
                }
              }
              
              return totalDuration;
            };
            
            let targetQuarter = recurringTask.quarter || 1;
            let quarterFound = false;
            const currentTaskDuration = recurringTask.durationMinutes || 15; // Default 15 minutes
            const quarterCapacityMinutes = 999; // Allow unlimited tasks per quarter for now (user not concerned about load balancing)

            // Try quarters 1-4 starting from preferred quarter
            for (let attempt = 0; attempt < 4; attempt++) {
              const testQuarter = ((targetQuarter - 1 + attempt) % 4) + 1;
              const existingEntry = blockSchedules.find(s => s.quartile === testQuarter);
              
              if (!existingEntry) {
                // Quarter is completely empty - use RECURRING_TASK format for first recurring task
                console.log(`[SYNC DEBUG] Found empty quarter ${testQuarter} in ${timeBlock.name} for ${recurringTask.taskName}`);
                if (!dryRun) {
                  await storage.createDailyScheduleEntry({
                    userId: req.user.id,
                    date: targetDate,
                    timeBlock: timeBlock.name,
                    quartile: testQuarter,
                    plannedTaskId: null, // Don't use plannedTaskId for recurring tasks
                    status: 'not_started',
                    reflection: `RECURRING_TASK:${recurringTask.taskName}`
                  });
                  console.log(`[SYNC DEBUG] Created daily schedule entry for ${recurringTask.taskName} in ${timeBlock.name} Q${testQuarter}`);
                }
                createdSchedules++;
                quarterFound = true;
                break;
              } else {
                // Quarter has existing content - check if new task can fit
                const existingDuration = await calculateQuarterDuration(existingEntry);
                const totalDurationWithNew = existingDuration + currentTaskDuration;
                
                console.log(`[SYNC DEBUG] Quarter ${testQuarter} occupied with ${existingDuration}min, adding ${currentTaskDuration}min = ${totalDurationWithNew}min (capacity: ${quarterCapacityMinutes}min)`);
                
                if (totalDurationWithNew <= quarterCapacityMinutes) {
                  // Tasks can fit together - create multiple tasks entry
                  console.log(`[SYNC DEBUG] Tasks fit together in quarter ${testQuarter}`);
                  
                  if (!dryRun) {
                    let newReflection: string;
                    
                    // Helper function for normalized task name comparison
                    const normalizeTaskName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
                    
                    if (existingEntry.reflection?.startsWith('MULTIPLE_TASKS:')) {
                      // Add to existing multiple tasks (with duplicate detection)
                      const existingTasks = existingEntry.reflection.replace('MULTIPLE_TASKS:', '');
                      const taskNames = existingTasks.split('|').map(name => name.trim());
                      
                      // Check for duplicates using normalized names
                      const normalizedNewTask = normalizeTaskName(recurringTask.taskName);
                      const normalizedExistingNames = taskNames.map(name => normalizeTaskName(name));
                      
                      if (!normalizedExistingNames.includes(normalizedNewTask)) {
                        newReflection = `MULTIPLE_TASKS:${existingTasks}|${recurringTask.taskName}`;
                        console.log(`[SYNC DEBUG] Adding ${recurringTask.taskName} to existing multiple tasks`);
                      } else {
                        console.log(`[SYNC DEBUG] Skipping ${recurringTask.taskName} - already exists in multiple tasks`);
                        quarterFound = true;
                        break; // Skip this quarter, task already exists
                      }
                    } else if (existingEntry.reflection?.startsWith('RECURRING_TASK:')) {
                      // Convert single recurring task to multiple (with duplicate detection)
                      const existingTask = existingEntry.reflection.replace('RECURRING_TASK:', '');
                      if (normalizeTaskName(existingTask) !== normalizeTaskName(recurringTask.taskName)) {
                        newReflection = `MULTIPLE_TASKS:${existingTask}|${recurringTask.taskName}`;
                        console.log(`[SYNC DEBUG] Converting single recurring to multiple: ${existingTask} + ${recurringTask.taskName}`);
                      } else {
                        console.log(`[SYNC DEBUG] Skipping ${recurringTask.taskName} - same as existing recurring task`);
                        quarterFound = true;
                        break; // Skip this quarter, task already exists
                      }
                    } else if (existingEntry.plannedTaskId) {
                      // Has a regular planned task - add recurring task (with duplicate detection)
                      const plannedTask = existingTasks.find(t => t.id === existingEntry.plannedTaskId);
                      if (plannedTask) {
                        if (normalizeTaskName(plannedTask.name) !== normalizeTaskName(recurringTask.taskName)) {
                          newReflection = `MULTIPLE_TASKS:${plannedTask.name}|${recurringTask.taskName}`;
                          console.log(`[SYNC DEBUG] Adding recurring task to planned task: ${plannedTask.name} + ${recurringTask.taskName}`);
                        } else {
                          console.log(`[SYNC DEBUG] Skipping ${recurringTask.taskName} - same as existing planned task`);
                          quarterFound = true;
                          break; // Skip this quarter, task already exists
                        }
                      } else {
                        newReflection = `MULTIPLE_TASKS:${recurringTask.taskName}`;
                        console.log(`[SYNC DEBUG] Planned task not found, creating single multiple task`);
                      }
                    } else {
                      // Fallback
                      newReflection = `MULTIPLE_TASKS:${recurringTask.taskName}`;
                      console.log(`[SYNC DEBUG] Creating new multiple task entry`);
                    }
                    
                    // Update existing schedule entry to include multiple tasks
                    await storage.updateDailyScheduleEntry(existingEntry.id, req.user.id, {
                      reflection: newReflection
                    });
                    
                    console.log(`[SYNC DEBUG] Updated schedule entry to include multiple tasks: ${newReflection}`);
                  }
                  
                  createdSchedules++;
                  quarterFound = true;
                  break;
                } else {
                  console.log(`[SYNC DEBUG] Quarter ${testQuarter} cannot fit ${currentTaskDuration}min task (would exceed capacity)`);
                }
              }
            }

            if (!quarterFound) {
              conflicts.push({
                recurringTaskId: recurringTask.id,
                taskName: recurringTask.taskName,
                date: dateStr,
                timeBlock: timeBlock.name,
                requestedQuartile: recurringTask.quarter || 1,
                reason: 'All quarters occupied in time block'
              });
              skipped++;
            }

          } catch (dateError) {
            conflicts.push({
              recurringTaskId: recurringTask.id,
              taskName: recurringTask.taskName,
              date: '',
              timeBlock: recurringTask.timeBlock,
              requestedQuartile: recurringTask.quarter || 1,
              reason: `Date calculation error: ${dateError instanceof Error ? dateError.message : 'Unknown error'}`
            });
            skipped++;
          }
        }
      }

      res.json({
        createdTasks,
        createdSchedules,
        skipped,
        conflicts,
        message: dryRun 
          ? `Dry run complete: Would create ${createdTasks} tasks and ${createdSchedules} schedule entries`
          : `Successfully synced ${createdTasks} tasks and ${createdSchedules} schedule entries to daily schedules`
      });

    } catch (error) {
      console.error("Error syncing recurring tasks to daily:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sync recurring tasks to daily";
      res.status(500).json({ message: errorMessage });
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
  
  // Helper function for WebSocket authentication
  async function authenticateWebSocketConnection(req: any): Promise<string | null> {
    try {
      // Parse cookies from WebSocket request
      const cookies = req.headers.cookie;
      if (!cookies) {
        throw new Error('Authentication required - no cookies provided');
      }
      
      // Extract session ID from cookies (connect.sid)
      const sessionCookie = cookies.split(';')
        .find((cookie: string) => cookie.trim().startsWith('connect.sid='));
      
      if (!sessionCookie) {
        throw new Error('Session cookie not found');
      }
      
      // Properly decode the session ID (URL-encoded)
      const encodedSessionId = sessionCookie.split('=')[1];
      if (!encodedSessionId) {
        throw new Error('Invalid session cookie format');
      }
      
      const sessionId = decodeURIComponent(encodedSessionId);
      
      // Remove the 's:' prefix and signature from signed cookie
      const actualSessionId = sessionId.startsWith('s:') 
        ? sessionId.substring(2).split('.')[0] 
        : sessionId;
      
      if (!actualSessionId) {
        throw new Error('Invalid session ID format');
      }
      
      // Get session from store with timeout
      const sessionStore = storage.sessionStore;
      const sessionData = await new Promise<any>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Session store query timeout'));
        }, 5000); // 5 second timeout
        
        sessionStore.get(actualSessionId, (err, session) => {
          clearTimeout(timeoutId);
          if (err) reject(err);
          else resolve(session);
        });
      });
      
      if (!sessionData) {
        throw new Error('Session not found or expired');
      }
      
      if (!sessionData.passport?.user) {
        throw new Error('No authenticated user in session');
      }
      
      // Validate user ID format
      const userId = sessionData.passport.user;
      if (typeof userId !== 'string' || !userId.trim()) {
        throw new Error('Invalid user ID in session');
      }
      
      return userId;
      
    } catch (error) {
      console.error('WebSocket authentication error:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  // WebSocket Setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const userConnections = new Map<string, Set<WebSocket>>();

  wss.on('connection', async (ws, req) => {
    let userId: string | null = null;
    
    try {
      // Authenticate connection using improved utility function
      userId = await authenticateWebSocketConnection(req);
      
      if (!userId) {
        ws.close(1008, 'Authentication failed');
        return;
      }
      
      // Add connection to user's connection set
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(ws);
      
      ws.send(JSON.stringify({ type: 'auth_success', userId }));
      console.log(`WebSocket authenticated for user: ${userId}`);
      
    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1008, 'Connection failed');
      return;
    }
    
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

  // Debug endpoint to test recurring tasks data
  app.get('/api/debug/recurring-tasks', isAuthenticated, async (req: any, res) => {
    try {
      const recurringTasks = await storage.getRecurringTasks(req.user.id);
      console.log('DEBUG Endpoint: Total recurring tasks:', recurringTasks.length);
      console.log('DEBUG Endpoint: First task keys:', recurringTasks.length > 0 ? Object.keys(recurringTasks[0]) : 'None');
      console.log('DEBUG Endpoint: First task data:', recurringTasks.length > 0 ? recurringTasks[0] : 'None');
      
      const testMapping = recurringTasks.map(rt => ({
        id: rt.id,
        taskName: rt.taskName,
        timeBlock: rt.timeBlock,
        quarter: rt.quarter,
        daysOfWeek: rt.daysOfWeek,
        durationMinutes: rt.durationMinutes,
        // Also try snake_case in case that's what's actually being returned
        taskName_alt: (rt as any).task_name,
        timeBlock_alt: (rt as any).time_block,
        quarter_alt: (rt as any).quartile
      }));
      
      res.json({
        total: recurringTasks.length,
        rawFirstTask: recurringTasks[0],
        mappedTasks: testMapping.slice(0, 5), // First 5 for debugging
        allTaskNames: recurringTasks.map(rt => rt.taskName || (rt as any).task_name || 'MISSING_NAME')
      });
    } catch (error) {
      console.error("Debug endpoint error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
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
