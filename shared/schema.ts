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
export const statusEnum = pgEnum("status", ["not_started", "in_progress", "completed", "blocked"]);

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
  progress: integer("progress").default(0), // 0-100
  why: text("why"), // rationale
  description: text("description"),
  assignee: text("assignee").default("self"),
  dueDate: timestamp("due_date"),
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

// Recurring tasks
export const recurringTasks = pgTable("recurring_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskName: text("task_name").notNull(),
  timeBlock: text("time_block").notNull(), // e.g., "PHYSICAL MENTAL"
  daysOfWeek: jsonb("days_of_week").$type<string[]>().notNull(), // ["monday", "tuesday", ...]
  category: categoryEnum("category").notNull(),
  subcategory: subcategoryEnum("subcategory").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  quartile: integer("quartile"), // 1-4 for which quartile within the block
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const recurringTasksRelations = relations(recurringTasks, ({ one }) => ({
  user: one(users, {
    fields: [recurringTasks.userId],
    references: [users.id],
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
  })
});

export const insertRecurringTaskSchema = createInsertSchema(recurringTasks).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
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
