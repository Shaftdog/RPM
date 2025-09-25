import {
  users,
  tasks,
  recurringTasks,
  recurringSchedules,
  taskSkips,
  dailySchedules,
  taskDependencies,
  taskHierarchy,
  type User,
  type InsertUser,
  type Task,
  type InsertTask,
  type RecurringTask,
  type InsertRecurringTask,
  type RecurringSchedule,
  type InsertRecurringSchedule,
  type TaskSkip,
  type InsertTaskSkip,
  type DailySchedule,
  type InsertDailySchedule,
  type TaskDependency,
  type InsertTaskDependency,
  type TaskHierarchy,
  type InsertTaskHierarchy,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, asc, gte, lte, sql, inArray } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations (required for auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Task operations
  getTasks(userId: string, filters?: {
    status?: string[];
    category?: string;
    subcategory?: string;
    timeHorizon?: string;
    dueDate?: { gte?: Date; lte?: Date };
    xDate?: { gte?: Date; lte?: Date };
  }): Promise<Task[]>;
  getTask(id: string, userId: string): Promise<Task | undefined>;
  createTask(task: InsertTask & { userId: string }): Promise<Task>;
  updateTask(id: string, userId: string, updates: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: string, userId: string): Promise<void>;

  // Recurring task operations
  getRecurringTasks(userId: string, dayOfWeek?: string): Promise<RecurringTask[]>;
  createRecurringTask(task: InsertRecurringTask & { userId: string }): Promise<RecurringTask>;
  updateRecurringTask(id: string, userId: string, updates: Partial<InsertRecurringTask>): Promise<RecurringTask>;
  deleteRecurringTask(id: string, userId: string): Promise<void>;

  // Recurring schedule operations
  getRecurringSchedules(userId: string, recurringTaskId?: string): Promise<RecurringSchedule[]>;
  createRecurringSchedule(schedule: InsertRecurringSchedule, userId: string): Promise<RecurringSchedule>;
  updateRecurringSchedule(id: string, userId: string, updates: Partial<InsertRecurringSchedule>): Promise<RecurringSchedule>;
  deleteRecurringSchedule(id: string, userId: string): Promise<void>;

  // Task skip operations  
  getTaskSkips(recurringScheduleId: string, userId: string): Promise<TaskSkip[]>;
  createTaskSkip(skip: InsertTaskSkip, userId: string): Promise<TaskSkip>;
  deleteTaskSkip(id: string, userId: string): Promise<void>;

  // Daily schedule operations
  getDailySchedule(userId: string, date: Date): Promise<DailySchedule[]>;
  getDailyScheduleEntry(id: string, userId: string): Promise<DailySchedule | undefined>;
  createDailyScheduleEntry(entry: InsertDailySchedule & { userId: string }): Promise<DailySchedule>;
  updateDailyScheduleEntry(id: string, userId: string, updates: Partial<InsertDailySchedule>): Promise<DailySchedule>;
  removeTaskFromAllDailySchedules(taskId: string, userId: string): Promise<void>;

  // Task dependency operations
  getTaskDependencies(taskId: string): Promise<TaskDependency[]>;
  createTaskDependency(dependency: InsertTaskDependency): Promise<TaskDependency>;
  deleteTaskDependency(id: string): Promise<void>;

  // Task hierarchy operations
  getTaskHierarchy(parentTaskId: string, userId?: string): Promise<TaskHierarchy[]>;
  createTaskHierarchy(hierarchy: InsertTaskHierarchy, userId: string): Promise<TaskHierarchy>;
  deleteTaskHierarchy(id: string, userId: string): Promise<void>;

  // Session store
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      tableName: 'sessions', // Use plural table name to match our schema
    });
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Task operations
  async getTasks(userId: string, filters?: {
    status?: string[];
    category?: string;
    subcategory?: string;
    timeHorizon?: string;
    dueDate?: { gte?: Date; lte?: Date };
    xDate?: { gte?: Date; lte?: Date };
  }): Promise<Task[]> {
    const conditions = [eq(tasks.userId, userId)];
    
    if (filters) {
      if (filters.status && filters.status.length > 0) {
        conditions.push(inArray(tasks.status, filters.status as any));
      }
      if (filters.category) {
        conditions.push(eq(tasks.category, filters.category as any));
      }
      if (filters.subcategory) {
        conditions.push(eq(tasks.subcategory, filters.subcategory as any));
      }
      if (filters.timeHorizon) {
        conditions.push(eq(tasks.timeHorizon, filters.timeHorizon as any));
      }
      if (filters.dueDate?.gte) {
        conditions.push(gte(tasks.dueDate, filters.dueDate.gte));
      }
      if (filters.dueDate?.lte) {
        conditions.push(lte(tasks.dueDate, filters.dueDate.lte));
      }
      if (filters.xDate?.gte) {
        conditions.push(gte(tasks.xDate, filters.xDate.gte));
      }
      if (filters.xDate?.lte) {
        conditions.push(lte(tasks.xDate, filters.xDate.lte));
      }
    }
    
    return db.select().from(tasks).where(and(...conditions)).orderBy(desc(tasks.createdAt));
  }

  async getTask(id: string, userId: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return task;
  }

  async createTask(task: InsertTask & { userId: string }): Promise<Task> {
    const [newTask] = await db
      .insert(tasks)
      .values(task)
      .returning();
    return newTask;
  }

  async updateTask(id: string, userId: string, updates: Partial<InsertTask>): Promise<Task> {
    const [updatedTask] = await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async deleteTask(id: string, userId: string): Promise<void> {
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }

  // Recurring task operations
  async getRecurringTasks(userId: string, dayOfWeek?: string): Promise<RecurringTask[]> {
    const conditions = [eq(recurringTasks.userId, userId), eq(recurringTasks.isActive, true)];
    
    if (dayOfWeek) {
      conditions.push(sql`${dayOfWeek} = ANY(${recurringTasks.daysOfWeek})`);
    }
    
    return db.select().from(recurringTasks).where(and(...conditions)).orderBy(asc(recurringTasks.timeBlock));
  }

  async createRecurringTask(task: InsertRecurringTask & { userId: string }): Promise<RecurringTask> {
    const [newTask] = await db
      .insert(recurringTasks)
      .values({ ...task, updatedAt: new Date() } as typeof recurringTasks.$inferInsert)
      .returning();
    return newTask;
  }

  async updateRecurringTask(id: string, userId: string, updates: Partial<InsertRecurringTask>): Promise<RecurringTask> {
    const [updatedTask] = await db
      .update(recurringTasks)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof recurringTasks.$inferInsert>)
      .where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async deleteRecurringTask(id: string, userId: string): Promise<void> {
    await db.delete(recurringTasks).where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)));
  }

  // Recurring schedule operations
  async getRecurringSchedules(userId: string, recurringTaskId?: string): Promise<RecurringSchedule[]> {
    const conditions = [
      eq(recurringSchedules.isActive, true),
      eq(recurringTasks.userId, userId)
    ];
    
    if (recurringTaskId) {
      conditions.push(eq(recurringSchedules.recurringTaskId, recurringTaskId));
    }
    
    return db.select({
      id: recurringSchedules.id,
      recurringTaskId: recurringSchedules.recurringTaskId,
      scheduleType: recurringSchedules.scheduleType,
      dayOfWeek: recurringSchedules.dayOfWeek,
      weekOfMonth: recurringSchedules.weekOfMonth,
      dayOfMonth: recurringSchedules.dayOfMonth,
      month: recurringSchedules.month,
      quarter: recurringSchedules.quarter,
      timeBlock: recurringSchedules.timeBlock,
      isActive: recurringSchedules.isActive,
      createdAt: recurringSchedules.createdAt,
      updatedAt: recurringSchedules.updatedAt,
    })
      .from(recurringSchedules)
      .innerJoin(recurringTasks, eq(recurringSchedules.recurringTaskId, recurringTasks.id))
      .where(and(...conditions));
  }

  async createRecurringSchedule(schedule: InsertRecurringSchedule, userId: string): Promise<RecurringSchedule> {
    // Verify the recurring task belongs to the user
    const taskOwnership = await db.select({ id: recurringTasks.id })
      .from(recurringTasks)
      .where(and(eq(recurringTasks.id, schedule.recurringTaskId), eq(recurringTasks.userId, userId)))
      .limit(1);
    
    if (taskOwnership.length === 0) {
      throw new Error('Unauthorized: recurring task not found or not owned by user');
    }

    const [newSchedule] = await db
      .insert(recurringSchedules)
      .values({ ...schedule, updatedAt: new Date() } as typeof recurringSchedules.$inferInsert)
      .returning();
    return newSchedule;
  }

  async updateRecurringSchedule(id: string, userId: string, updates: Partial<InsertRecurringSchedule>): Promise<RecurringSchedule> {
    const [updatedSchedule] = await db
      .update(recurringSchedules)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof recurringSchedules.$inferInsert>)
      .from(recurringTasks)
      .where(and(
        eq(recurringSchedules.id, id),
        eq(recurringSchedules.recurringTaskId, recurringTasks.id),
        eq(recurringTasks.userId, userId)
      ))
      .returning();
    return updatedSchedule;
  }

  async deleteRecurringSchedule(id: string, userId: string): Promise<void> {
    await db
      .delete(recurringSchedules)
      .where(and(
        eq(recurringSchedules.id, id),
        sql`EXISTS (
          SELECT 1 FROM ${recurringTasks} 
          WHERE ${recurringTasks.id} = ${recurringSchedules.recurringTaskId} 
          AND ${recurringTasks.userId} = ${userId}
        )`
      ));
  }

  // Task skip operations
  async getTaskSkips(recurringScheduleId: string, userId: string): Promise<TaskSkip[]> {
    return db.select({
      id: taskSkips.id,
      recurringScheduleId: taskSkips.recurringScheduleId,
      skipDate: taskSkips.skipDate,
      reason: taskSkips.reason,
      createdAt: taskSkips.createdAt,
    })
      .from(taskSkips)
      .innerJoin(recurringSchedules, eq(taskSkips.recurringScheduleId, recurringSchedules.id))
      .innerJoin(recurringTasks, eq(recurringSchedules.recurringTaskId, recurringTasks.id))
      .where(and(
        eq(taskSkips.recurringScheduleId, recurringScheduleId),
        eq(recurringTasks.userId, userId)
      ));
  }

  async createTaskSkip(skip: InsertTaskSkip, userId: string): Promise<TaskSkip> {
    // Verify the recurring schedule belongs to a task owned by the user
    const scheduleOwnership = await db.select({ id: recurringSchedules.id })
      .from(recurringSchedules)
      .innerJoin(recurringTasks, eq(recurringSchedules.recurringTaskId, recurringTasks.id))
      .where(and(
        eq(recurringSchedules.id, skip.recurringScheduleId),
        eq(recurringTasks.userId, userId)
      ))
      .limit(1);
    
    if (scheduleOwnership.length === 0) {
      throw new Error('Unauthorized: recurring schedule not found or not owned by user');
    }

    const [newSkip] = await db
      .insert(taskSkips)
      .values(skip)
      .returning();
    return newSkip;
  }

  async deleteTaskSkip(id: string, userId: string): Promise<void> {
    await db
      .delete(taskSkips)
      .where(sql`${taskSkips.id} = ${id} AND EXISTS (
        SELECT 1 FROM ${recurringSchedules} 
        JOIN ${recurringTasks} ON ${recurringSchedules.recurringTaskId} = ${recurringTasks.id}
        WHERE ${recurringSchedules.id} = ${taskSkips.recurringScheduleId} 
        AND ${recurringTasks.userId} = ${userId}
      )`);
  }

  // Daily schedule operations
  async getDailySchedule(userId: string, date: Date): Promise<DailySchedule[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return db.select()
      .from(dailySchedules)
      .where(and(
        eq(dailySchedules.userId, userId),
        gte(dailySchedules.date, startOfDay),
        lte(dailySchedules.date, endOfDay)
      ))
      .orderBy(asc(dailySchedules.timeBlock), asc(dailySchedules.quartile));
  }

  async getDailyScheduleEntry(id: string, userId: string): Promise<DailySchedule | undefined> {
    const [entry] = await db.select()
      .from(dailySchedules)
      .where(and(
        eq(dailySchedules.id, id),
        eq(dailySchedules.userId, userId)
      ));
    return entry;
  }

  async createDailyScheduleEntry(entry: InsertDailySchedule & { userId: string }): Promise<DailySchedule> {
    const [newEntry] = await db
      .insert(dailySchedules)
      .values({ ...entry, updatedAt: new Date() })
      .returning();
    return newEntry;
  }

  async updateDailyScheduleEntry(id: string, userId: string, updates: Partial<InsertDailySchedule>): Promise<DailySchedule> {
    const [updatedEntry] = await db
      .update(dailySchedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(dailySchedules.id, id), eq(dailySchedules.userId, userId)))
      .returning();
    return updatedEntry;
  }

  async clearDailySchedule(userId: string, date: Date): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    await db.delete(dailySchedules)
      .where(and(
        eq(dailySchedules.userId, userId),
        gte(dailySchedules.date, startOfDay),
        lte(dailySchedules.date, endOfDay)
      ));
  }

  async createDailyScheduleEntries(userId: string, entries: Array<Omit<InsertDailySchedule, 'userId'>>): Promise<DailySchedule[]> {
    const entriesWithUserId = entries.map(entry => ({
      ...entry,
      userId,
      updatedAt: new Date()
    }));
    
    const newEntries = await db
      .insert(dailySchedules)
      .values(entriesWithUserId)
      .returning();
    return newEntries;
  }

  async removeTaskFromAllDailySchedules(taskId: string, userId: string): Promise<void> {
    await db.delete(dailySchedules)
      .where(and(
        eq(dailySchedules.userId, userId),
        or(
          eq(dailySchedules.plannedTaskId, taskId),
          eq(dailySchedules.actualTaskId, taskId)
        )
      ));
  }

  async deleteDailyScheduleEntry(id: string, userId: string): Promise<void> {
    await db.delete(dailySchedules)
      .where(and(
        eq(dailySchedules.id, id),
        eq(dailySchedules.userId, userId)
      ));
  }

  // Task dependency operations
  async getTaskDependencies(taskId: string): Promise<TaskDependency[]> {
    return db.select().from(taskDependencies).where(eq(taskDependencies.taskId, taskId));
  }

  async createTaskDependency(dependency: InsertTaskDependency): Promise<TaskDependency> {
    const [newDependency] = await db
      .insert(taskDependencies)
      .values(dependency)
      .returning();
    return newDependency;
  }

  async deleteTaskDependency(id: string): Promise<void> {
    await db.delete(taskDependencies).where(eq(taskDependencies.id, id));
  }

  // Task hierarchy operations
  async getTaskHierarchy(parentTaskId: string, userId?: string): Promise<TaskHierarchy[]> {
    if (userId) {
      // Scope results to user by joining child tasks and filtering by user ownership
      return db.select({
        id: taskHierarchy.id,
        parentTaskId: taskHierarchy.parentTaskId,
        childTaskId: taskHierarchy.childTaskId,
        hierarchyLevel: taskHierarchy.hierarchyLevel,
        createdAt: taskHierarchy.createdAt
      })
      .from(taskHierarchy)
      .innerJoin(tasks, eq(taskHierarchy.childTaskId, tasks.id))
      .where(and(
        eq(taskHierarchy.parentTaskId, parentTaskId),
        eq(tasks.userId, userId)
      ));
    } else {
      // Legacy behavior for backwards compatibility
      return db.select().from(taskHierarchy).where(eq(taskHierarchy.parentTaskId, parentTaskId));
    }
  }

  async createTaskHierarchy(hierarchy: InsertTaskHierarchy, userId: string): Promise<TaskHierarchy> {
    // Verify ownership of both parent and child tasks at storage level
    const [parentTask, childTask] = await Promise.all([
      db.select().from(tasks).where(and(
        eq(tasks.id, hierarchy.parentTaskId),
        eq(tasks.userId, userId)
      )),
      db.select().from(tasks).where(and(
        eq(tasks.id, hierarchy.childTaskId),
        eq(tasks.userId, userId)
      ))
    ]);

    if (parentTask.length === 0) {
      throw new Error("Parent task not found or access denied");
    }
    if (childTask.length === 0) {
      throw new Error("Child task not found or access denied");
    }

    // Check for duplicate relationship
    const existing = await db.select()
      .from(taskHierarchy)
      .where(and(
        eq(taskHierarchy.parentTaskId, hierarchy.parentTaskId),
        eq(taskHierarchy.childTaskId, hierarchy.childTaskId)
      ));
    
    if (existing.length > 0) {
      throw new Error("Hierarchy relationship already exists");
    }

    // Detect cycles by checking if child is an ancestor of parent
    const hasChildInAncestors = await this.hasTaskInAncestors(hierarchy.parentTaskId, hierarchy.childTaskId);
    if (hasChildInAncestors) {
      throw new Error("Creating this relationship would create a cycle in the hierarchy");
    }

    // Compute hierarchy level based on parent's level
    const parentLevel = await this.getTaskHierarchyLevel(hierarchy.parentTaskId);
    const computedHierarchy = {
      ...hierarchy,
      hierarchyLevel: parentLevel + 1
    };

    const [newHierarchy] = await db
      .insert(taskHierarchy)
      .values(computedHierarchy)
      .returning();
    return newHierarchy;
  }

  async deleteTaskHierarchy(id: string, userId: string): Promise<void> {
    // Get hierarchy details with task ownership verification
    const hierarchyWithTasks = await db.select({
      hierarchy: taskHierarchy,
      parentTask: tasks,
      childTask: {
        id: sql`child_task.id`.as('child_task_id'),
        userId: sql`child_task.user_id`.as('child_task_user_id')
      }
    })
    .from(taskHierarchy)
    .innerJoin(tasks, eq(taskHierarchy.parentTaskId, tasks.id))
    .innerJoin(sql`tasks as child_task`, sql`task_hierarchy.child_task_id = child_task.id`)
    .where(eq(taskHierarchy.id, id));

    if (hierarchyWithTasks.length === 0) {
      throw new Error("Hierarchy relationship not found");
    }

    const record = hierarchyWithTasks[0];
    
    // Verify both parent and child belong to the user
    if (record.parentTask.userId !== userId || record.childTask.userId !== userId) {
      throw new Error("Unauthorized: Cannot delete hierarchy for tasks you don't own");
    }

    await db.delete(taskHierarchy).where(eq(taskHierarchy.id, id));
  }

  // Helper method to check if a task is an ancestor of another task
  private async hasTaskInAncestors(taskId: string, potentialAncestorId: string): Promise<boolean> {
    if (taskId === potentialAncestorId) return true;
    
    const parents = await db.select()
      .from(taskHierarchy)
      .where(eq(taskHierarchy.childTaskId, taskId));
    
    for (const parent of parents) {
      const hasAncestor = await this.hasTaskInAncestors(parent.parentTaskId, potentialAncestorId);
      if (hasAncestor) return true;
    }
    
    return false;
  }

  // Helper method to get task hierarchy level (0 = root, 1 = child, etc.)
  private async getTaskHierarchyLevel(taskId: string): Promise<number> {
    const parentRelations = await db.select()
      .from(taskHierarchy)
      .where(eq(taskHierarchy.childTaskId, taskId));
    
    if (parentRelations.length === 0) {
      return 0; // Root level task
    }
    
    // Assuming single parent (tree structure)
    const parentLevel = await this.getTaskHierarchyLevel(parentRelations[0].parentTaskId);
    return parentLevel + 1;
  }
}

export const storage = new DatabaseStorage();
