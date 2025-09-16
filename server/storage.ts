import {
  users,
  tasks,
  recurringTasks,
  dailySchedules,
  taskDependencies,
  taskHierarchy,
  type User,
  type InsertUser,
  type Task,
  type InsertTask,
  type RecurringTask,
  type InsertRecurringTask,
  type DailySchedule,
  type InsertDailySchedule,
  type TaskDependency,
  type InsertTaskDependency,
  type TaskHierarchy,
  type InsertTaskHierarchy,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gte, lte, sql, inArray } from "drizzle-orm";
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

  // Daily schedule operations
  getDailySchedule(userId: string, date: Date): Promise<DailySchedule[]>;
  createDailyScheduleEntry(entry: InsertDailySchedule & { userId: string }): Promise<DailySchedule>;
  updateDailyScheduleEntry(id: string, userId: string, updates: Partial<InsertDailySchedule>): Promise<DailySchedule>;

  // Task dependency operations
  getTaskDependencies(taskId: string): Promise<TaskDependency[]>;
  createTaskDependency(dependency: InsertTaskDependency): Promise<TaskDependency>;
  deleteTaskDependency(id: string): Promise<void>;

  // Task hierarchy operations
  getTaskHierarchy(parentTaskId: string): Promise<TaskHierarchy[]>;
  createTaskHierarchy(hierarchy: InsertTaskHierarchy): Promise<TaskHierarchy>;
  deleteTaskHierarchy(id: string): Promise<void>;

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
      .values({ ...task, updatedAt: new Date() })
      .returning();
    return newTask;
  }

  async updateTask(id: string, userId: string, updates: Partial<InsertTask>): Promise<Task> {
    const [updatedTask] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
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
      .values(task)
      .returning();
    return newTask;
  }

  async updateRecurringTask(id: string, userId: string, updates: Partial<InsertRecurringTask>): Promise<RecurringTask> {
    const [updatedTask] = await db
      .update(recurringTasks)
      .set(updates)
      .where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)))
      .returning();
    return updatedTask;
  }

  async deleteRecurringTask(id: string, userId: string): Promise<void> {
    await db.delete(recurringTasks).where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)));
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
  async getTaskHierarchy(parentTaskId: string): Promise<TaskHierarchy[]> {
    return db.select().from(taskHierarchy).where(eq(taskHierarchy.parentTaskId, parentTaskId));
  }

  async createTaskHierarchy(hierarchy: InsertTaskHierarchy): Promise<TaskHierarchy> {
    const [newHierarchy] = await db
      .insert(taskHierarchy)
      .values(hierarchy)
      .returning();
    return newHierarchy;
  }

  async deleteTaskHierarchy(id: string): Promise<void> {
    await db.delete(taskHierarchy).where(eq(taskHierarchy.id, id));
  }
}

export const storage = new DatabaseStorage();
