import { sql, relations } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  integer, 
  timestamp, 
  decimal,
  pgEnum,
  boolean,
  jsonb,
  index
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: varchar("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  workHours: jsonb("work_hours").$type<{start: string, end: string}>().default({ start: "9:00", end: "17:00" }),
  energyPatterns: jsonb("energy_patterns").$type<Record<string, number>>(),
  categoryGoals: jsonb("category_goals").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enums
export const taskTypeEnum = pgEnum("task_type", ["Milestone", "Sub-Milestone", "Task", "Subtask"]);
export const categoryEnum = pgEnum("category", ["Personal", "Business"]);
export const subcategoryEnum = pgEnum("subcategory", [
  "Physical", "Mental", "Relationship", "Environmental", "Financial", "Adventure",
  "Marketing", "Sales", "Operations", "Products", "Production"
]);
export const timeHorizonEnum = pgEnum("time_horizon", [
  "VISION", "10 Year", "5 Year", "1 Year", "Quarter", "Week", "Today", "BACKLOG"
]);
export const priorityEnum = pgEnum("priority", ["High", "Medium", "Low"]);
export const statusEnum = pgEnum("status", ["not_started", "in_progress", "completed", "blocked", "cancelled"]);
export const scheduleTypeEnum = pgEnum("schedule_type", ["weekly", "monthly", "quarterly", "yearly"]);
export const weekOfMonthEnum = pgEnum("week_of_month", ["1", "2", "3", "4", "last"]);

// Centralized time blocks definition - used across AI prompt, local scheduler, and UI
export const TIME_BLOCKS = [
  { name: "Recover", start: "6:00", end: "7:00" },
  { name: "PHYSICAL MENTAL", start: "7:00", end: "9:00" },
  { name: "CHIEF PROJECT", start: "9:00", end: "11:00" },
  { name: "HOUR OF POWER", start: "11:00", end: "12:00" },
  { name: "PRODUCTION WORK", start: "12:00", end: "13:00" },
  { name: "COMPANY BLOCK", start: "13:00", end: "14:00" },
  { name: "BUSINESS AUTOMATION", start: "14:00", end: "15:00" },
  { name: "ENVIRONMENTAL", start: "15:00", end: "16:00" },
  { name: "FLEXIBLE BLOCK", start: "16:00", end: "19:00" },
  { name: "WIND DOWN", start: "19:00", end: "21:00" }
] as const;

// Tasks table
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: taskTypeEnum("type").notNull().default("Task"),
  category: categoryEnum("category").notNull(),
  subcategory: subcategoryEnum("subcategory").notNull(),
  timeHorizon: timeHorizonEnum("time_horizon").notNull().default("Week"),
  status: statusEnum("status").notNull().default("not_started"),
  priority: priorityEnum("priority").notNull().default("Medium"),
  estimatedTime: decimal("estimated_time", { precision: 5, scale: 2 }), // hours
  actualTime: decimal("actual_time", { precision: 5, scale: 2 }), // hours
  caloriesIntake: decimal("calories_intake", { precision: 8, scale: 2 }), // calories gained from task completion
  caloriesExpenditure: decimal("calories_expenditure", { precision: 8, scale: 2 }), // calories burned during task
  progress: integer("progress").default(0), // 0-100
  why: text("why"), // rationale
  description: text("description"),
  assignee: text("assignee").default("self"),
  dueDate: timestamp("due_date"),
  xDate: timestamp("x_date"), // Work date - when you plan to work on it
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task dependencies
export const taskDependencies = pgTable("task_dependencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  dependsOnTaskId: varchar("depends_on_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Task hierarchy
export const taskHierarchy = pgTable("task_hierarchy", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentTaskId: varchar("parent_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  childTaskId: varchar("child_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  hierarchyLevel: integer("hierarchy_level").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Enhanced Recurring tasks with comprehensive fields
export const recurringTasks = pgTable("recurring_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskName: text("task_name").notNull(),
  taskType: taskTypeEnum("task_type").notNull().default("Task"),
  timeBlock: text("time_block").notNull(), // e.g., "PHYSICAL MENTAL"
  daysOfWeek: jsonb("days_of_week").$type<string[]>().notNull(), // ["monday", "tuesday", ...]
  category: categoryEnum("category").notNull(),
  subcategory: subcategoryEnum("subcategory").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  energyImpact: integer("energy_impact").default(0), // -500 to +500
  priority: priorityEnum("priority").notNull().default("Medium"),
  quarter: integer("quarter"), // 1-4 for Q1, Q2, Q3, Q4 within the time block
  description: text("description"),
  defaultTimeBlock: text("default_time_block"), // optional preferred time block
  tags: jsonb("tags").$type<string[]>(), // array of tags
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Recurring schedules for different patterns (monthly, quarterly, yearly)
export const recurringSchedules = pgTable("recurring_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recurringTaskId: varchar("recurring_task_id").notNull().references(() => recurringTasks.id, { onDelete: "cascade" }),
  scheduleType: scheduleTypeEnum("schedule_type").notNull(),
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly (Sunday=0)
  weekOfMonth: weekOfMonthEnum("week_of_month"), // 1-4 or 'last' for monthly
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly/yearly
  month: integer("month"), // 1-12 for yearly
  quarter: integer("quarter"), // 1-4 for quarterly
  timeBlock: text("time_block"), // maps to the 10 time blocks
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task skips for tracking when users skip recurring instances
export const taskSkips = pgTable("task_skips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recurringScheduleId: varchar("recurring_schedule_id").notNull().references(() => recurringSchedules.id, { onDelete: "cascade" }),
  skipDate: timestamp("skip_date").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily schedules
export const dailySchedules = pgTable("daily_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  timeBlock: text("time_block").notNull(), // e.g., "PHYSICAL MENTAL"
  quartile: integer("quartile").notNull(), // 1-4
  plannedTaskId: varchar("planned_task_id").references(() => tasks.id, { onDelete: "set null" }),
  actualTaskId: varchar("actual_task_id").references(() => tasks.id, { onDelete: "set null" }),
  status: statusEnum("status").notNull().default("not_started"),
  energyImpact: integer("energy_impact").default(0), // positive or negative
  reflection: text("reflection"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  recurringTasks: many(recurringTasks),
  dailySchedules: many(dailySchedules),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  dependencies: many(taskDependencies, { relationName: "taskDependencies" }),
  dependentOn: many(taskDependencies, { relationName: "dependentOnTasks" }),
  parentHierarchy: many(taskHierarchy, { relationName: "parentTasks" }),
  childHierarchy: many(taskHierarchy, { relationName: "childTasks" }),
  plannedSchedules: many(dailySchedules, { relationName: "plannedTasks" }),
  actualSchedules: many(dailySchedules, { relationName: "actualTasks" }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: "taskDependencies",
  }),
  dependsOnTask: one(tasks, {
    fields: [taskDependencies.dependsOnTaskId],
    references: [tasks.id],
    relationName: "dependentOnTasks",
  }),
}));

export const taskHierarchyRelations = relations(taskHierarchy, ({ one }) => ({
  parentTask: one(tasks, {
    fields: [taskHierarchy.parentTaskId],
    references: [tasks.id],
    relationName: "parentTasks",
  }),
  childTask: one(tasks, {
    fields: [taskHierarchy.childTaskId],
    references: [tasks.id],
    relationName: "childTasks",
  }),
}));

export const recurringTasksRelations = relations(recurringTasks, ({ one, many }) => ({
  user: one(users, {
    fields: [recurringTasks.userId],
    references: [users.id],
  }),
  schedules: many(recurringSchedules),
}));

export const recurringSchedulesRelations = relations(recurringSchedules, ({ one, many }) => ({
  recurringTask: one(recurringTasks, {
    fields: [recurringSchedules.recurringTaskId],
    references: [recurringTasks.id],
  }),
  skips: many(taskSkips),
}));

export const taskSkipsRelations = relations(taskSkips, ({ one }) => ({
  recurringSchedule: one(recurringSchedules, {
    fields: [taskSkips.recurringScheduleId],
    references: [recurringSchedules.id],
  }),
}));

export const dailySchedulesRelations = relations(dailySchedules, ({ one }) => ({
  user: one(users, {
    fields: [dailySchedules.userId],
    references: [users.id],
  }),
  plannedTask: one(tasks, {
    fields: [dailySchedules.plannedTaskId],
    references: [tasks.id],
    relationName: "plannedTasks",
  }),
  actualTask: one(tasks, {
    fields: [dailySchedules.actualTaskId],
    references: [tasks.id],
    relationName: "actualTasks",
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  firstName: true,
  lastName: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  dueDate: z.union([z.date(), z.string().datetime().nullable(), z.null()]).optional().transform((val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  xDate: z.union([z.date(), z.string().datetime().nullable(), z.null()]).optional().transform((val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  caloriesIntake: z.union([z.number(), z.string().optional(), z.null()]).optional().transform((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  }),
  caloriesExpenditure: z.union([z.number(), z.string().optional(), z.null()]).optional().transform((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  }),
  estimatedTime: z.union([z.number(), z.string().optional(), z.null()]).optional().transform((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  }),
  actualTime: z.union([z.number(), z.string().optional(), z.null()]).optional().transform((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  })
});

export const insertRecurringTaskSchema = createInsertSchema(recurringTasks)
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    daysOfWeek: z.array(z.string()),
    tags: z.array(z.string()).optional(),
  });

export const insertRecurringScheduleSchema = createInsertSchema(recurringSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskSkipSchema = createInsertSchema(taskSkips).omit({
  id: true,
  createdAt: true,
});

export const insertDailyScheduleSchema = createInsertSchema(dailySchedules).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskDependencySchema = createInsertSchema(taskDependencies).omit({
  id: true,
  createdAt: true,
});

export const insertTaskHierarchySchema = createInsertSchema(taskHierarchy).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type RecurringTask = typeof recurringTasks.$inferSelect;
export type InsertRecurringTask = z.infer<typeof insertRecurringTaskSchema>;
export type DailySchedule = typeof dailySchedules.$inferSelect;
export type InsertDailySchedule = z.infer<typeof insertDailyScheduleSchema>;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type InsertTaskDependency = z.infer<typeof insertTaskDependencySchema>;
export type TaskHierarchy = typeof taskHierarchy.$inferSelect;
export type InsertTaskHierarchy = z.infer<typeof insertTaskHierarchySchema>;
export type RecurringSchedule = typeof recurringSchedules.$inferSelect;
export type InsertRecurringSchedule = z.infer<typeof insertRecurringScheduleSchema>;
export type TaskSkip = typeof taskSkips.$inferSelect;
export type InsertTaskSkip = z.infer<typeof insertTaskSkipSchema>;

// Daily Schedule Response Schema (canonical format for OpenAI + local fallback)
export const dailyScheduleTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.enum(["High", "Medium", "Low"]),
  estimatedTime: z.string(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
});

export const dailyScheduleQuartileSchema = z.object({
  task: dailyScheduleTaskSchema,
  start: z.string(),
  end: z.string(),
  allocatedTime: z.string(),
});

export const dailyScheduleBlockSchema = z.object({
  timeBlock: z.string(),
  start: z.string(),
  end: z.string(),
  quartiles: z.array(dailyScheduleQuartileSchema),
});

export const dailyScheduleResponseSchema = z.object({
  schedule: z.array(dailyScheduleBlockSchema),
  source: z.enum(["openai", "local_fallback"]),
  totalTasks: z.number().optional(),
});

export type DailyScheduleResponse = z.infer<typeof dailyScheduleResponseSchema>;
