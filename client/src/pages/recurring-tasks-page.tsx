import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  Clock, 
  Plus, 
  MoreVertical,
  GripVertical,
  Repeat,
  CalendarDays
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { RecurringTask, RecurringSchedule, InsertRecurringTask } from "@shared/schema";
import { insertRecurringTaskSchema } from "@shared/schema";

// Types imported from @shared/schema

const DAYS_OF_WEEK = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

const TIME_BLOCKS = [
  "Recover (12am-7am)",
  "PHYSICAL MENTAL (7-9AM)",
  "CHIEF PROJECT (9-11AM)",
  "HOUR OF POWER (11-12PM)",
  "PRODUCTION WORK (12-2PM)",
  "COMPANY BLOCK (2-4PM)",
  "BUSINESS AUTOMATION (4-6PM)",
  "ENVIRONMENTAL (6-8PM)",
  "FLEXIBLE BLOCK (8-10PM)",
  "WIND DOWN (10PM-12AM)"
];

export default function RecurringTasksPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<"weekly" | "monthly" | "quarterly" | "yearly">("weekly");
  const [draggedTask, setDraggedTask] = useState<RecurringTask | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch recurring tasks
  const { data: recurringTasks = [], isLoading: tasksLoading, error: tasksError } = useQuery<RecurringTask[]>({
    queryKey: ['/api/recurring-tasks'],
    enabled: true,
  });

  // Fetch recurring schedules
  const { data: recurringSchedules = [], isLoading: schedulesLoading, error: schedulesError } = useQuery<RecurringSchedule[]>({
    queryKey: ['/api/recurring/schedule'],
    enabled: true,
  });

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: async (scheduleData: any) => {
      return apiRequest("POST", "/api/recurring/schedule", scheduleData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring/schedule'] });
      toast({
        title: "Schedule created!",
        description: "Task successfully scheduled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating schedule",
        description: error.message || "Failed to create schedule",
        variant: "destructive",
      });
    },
  });

  // Create recurring task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: InsertRecurringTask) => {
      const response = await apiRequest("POST", "/api/recurring-tasks", taskData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-tasks'] });
      toast({
        title: "Task created!",
        description: "Recurring task created successfully.",
      });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error creating task",
        description: error.message || "Failed to create task",
        variant: "destructive",
      });
    },
  });

  // Form for creating new recurring task
  const form = useForm<InsertRecurringTask>({
    resolver: zodResolver(insertRecurringTaskSchema),
    defaultValues: {
      taskName: "",
      taskType: "Task",
      timeBlock: "",
      daysOfWeek: [],
      category: "Personal",
      subcategory: "Physical",
      durationMinutes: 30,
      energyImpact: 0,
      priority: "Medium",
      description: "",
      tags: [],
      isActive: true,
    },
  });

  const onSubmit = (data: InsertRecurringTask) => {
    createTaskMutation.mutate(data);
  };

  const handleDragStart = (task: RecurringTask) => {
    setDraggedTask(task);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
  };

  const handleDrop = (dayIndex: number, timeBlock: string) => {
    if (!draggedTask) return;
    
    // Create a weekly recurring schedule
    const scheduleData = {
      recurringTaskId: draggedTask.id,
      scheduleType: "weekly" as const,
      dayOfWeek: dayIndex,
      timeBlock: timeBlock,
      isActive: true,
    };
    
    createScheduleMutation.mutate(scheduleData);
    setDraggedTask(null);
  };

  const TaskCard = ({ task }: { task: RecurringTask }) => (
    <Card 
      className="mb-2 cursor-grab active:cursor-grabbing border-l-4 border-l-primary"
      draggable
      onDragStart={() => handleDragStart(task)}
      onDragEnd={handleDragEnd}
      data-testid={`task-card-${task.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <GripVertical className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium text-sm">{task.taskName}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                {task.taskType}
              </Badge>
              <Badge variant="secondary">
                Active
              </Badge>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {Math.round(task.durationMinutes/60*10)/10}h
              </span>
              <span 
                className={`flex items-center gap-1 text-xs font-medium ${
                  (task.energyImpact ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
                data-testid={`energy-impact-${task.id}`}
              >
                {(task.energyImpact ?? 0) >= 0 ? '+' : ''}{task.energyImpact ?? 0}
              </span>
            </div>
            {task.tags && task.tags.length > 0 && (
              <div className="flex gap-1 mt-1">
                {task.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" data-testid={`menu-task-${task.id}`}>
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );

  const WeeklyMatrix = () => (
    <div className="grid grid-cols-8 gap-2">
      {/* Header row */}
      <div className="text-xs font-medium text-muted-foreground p-2">Time Block</div>
      {DAYS_OF_WEEK.map((day) => (
        <div key={day} className="text-xs font-medium text-center p-2 bg-muted rounded">
          {day}
        </div>
      ))}

      {/* Time block rows */}
      {TIME_BLOCKS.map((timeBlock) => (
        <>
          <div key={timeBlock} className="text-xs font-medium text-muted-foreground p-2 border-r">
            {timeBlock}
          </div>
          {DAYS_OF_WEEK.map((day, dayIndex) => (
            <div
              key={`${timeBlock}-${day}`}
              className="min-h-20 p-2 border border-dashed border-muted-foreground/20 rounded hover:bg-muted/50 transition-colors"
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(dayIndex, timeBlock);
              }}
              onDragOver={(e) => e.preventDefault()}
              data-testid={`drop-zone-${dayIndex}-${timeBlock}`}
            >
              {/* Scheduled tasks will appear here */}
              {recurringSchedules
                .filter(schedule => 
                  schedule.scheduleType === "weekly" && 
                  schedule.dayOfWeek === dayIndex && 
                  schedule.timeBlock === timeBlock
                )
                .map(schedule => {
                  const task = recurringTasks.find(t => t.id === schedule.recurringTaskId);
                  if (!task) return null;
                  return (
                    <div key={schedule.id} className="text-xs bg-primary/10 border border-primary/20 rounded p-1 mb-1">
                      <div className="font-medium">{task.taskName}</div>
                      <div className="text-muted-foreground">{Math.round(task.durationMinutes/60*10)/10}h</div>
                    </div>
                  );
                })}
            </div>
          ))}
        </>
      ))}
    </div>
  );

  const PeriodicRecurring = () => (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["monthly", "quarterly", "yearly"] as const).map((period) => (
          <Button
            key={period}
            variant={selectedPeriod === period ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedPeriod(period)}
            data-testid={`period-${period}`}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recurringSchedules
          .filter(schedule => schedule.scheduleType === selectedPeriod)
          .map(schedule => {
            const task = recurringTasks.find(t => t.id === schedule.recurringTaskId);
            if (!task) return null;
            
            let scheduleText = "";
            if (selectedPeriod === "monthly") {
              scheduleText = schedule.dayOfMonth ? `Day ${schedule.dayOfMonth}` : 
                           schedule.weekOfMonth ? `Week ${schedule.weekOfMonth}` : "";
            } else if (selectedPeriod === "quarterly") {
              scheduleText = `Q${schedule.quarter}`;
            } else if (selectedPeriod === "yearly") {
              scheduleText = schedule.month ? `Month ${schedule.month}` : "";
            }

            return (
              <Card key={schedule.id} className="border-l-4 border-l-secondary">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{task.taskName}</h4>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem>Edit Schedule</DropdownMenuItem>
                        <DropdownMenuItem>Skip Next</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Remove</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-3 w-3" />
                      {scheduleText}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {Math.round(task.durationMinutes/60*10)/10}h
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {task.category}
                      </Badge>
                      <Badge variant="secondary">
                        Active
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );

  const TaskLibrarySidebar = () => (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Task Library</CardTitle>
          <Button size="sm" data-testid="button-add-recurring-task">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[600px] px-4">
          {tasksLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {recurringTasks.map((task: RecurringTask) => (
                <TaskCard key={task.id} task={task} />
              ))}
              {recurringTasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Repeat className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recurring tasks yet</p>
                  <p className="text-xs">Create your first recurring task</p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );

  if (tasksLoading || schedulesLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 h-96 bg-muted rounded" />
            <div className="h-96 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recurring Tasks</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            View Calendar
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-recurring">
                <Plus className="h-4 w-4 mr-2" />
                Create Recurring Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Recurring Task</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="taskName"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Task Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter task name" {...field} data-testid="input-task-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="taskType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-task-type">
                                <SelectValue placeholder="Select task type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Milestone">Milestone</SelectItem>
                              <SelectItem value="Sub-Milestone">Sub-Milestone</SelectItem>
                              <SelectItem value="Task">Task</SelectItem>
                              <SelectItem value="Subtask">Subtask</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Personal">Personal</SelectItem>
                              <SelectItem value="Business">Business</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="subcategory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subcategory</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-subcategory">
                                <SelectValue placeholder="Select subcategory" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Physical">Physical</SelectItem>
                              <SelectItem value="Mental">Mental</SelectItem>
                              <SelectItem value="Relationship">Relationship</SelectItem>
                              <SelectItem value="Environmental">Environmental</SelectItem>
                              <SelectItem value="Financial">Financial</SelectItem>
                              <SelectItem value="Adventure">Adventure</SelectItem>
                              <SelectItem value="Marketing">Marketing</SelectItem>
                              <SelectItem value="Sales">Sales</SelectItem>
                              <SelectItem value="Operations">Operations</SelectItem>
                              <SelectItem value="Products">Products</SelectItem>
                              <SelectItem value="Production">Production</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="timeBlock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time Block</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-time-block">
                                <SelectValue placeholder="Select time block" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TIME_BLOCKS.map((block) => (
                                <SelectItem key={block} value={block}>{block}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="durationMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration (minutes)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="30" 
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-duration"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="energyImpact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Energy Impact</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Slider
                                min={-500}
                                max={500}
                                step={50}
                                value={[field.value || 0]}
                                onValueChange={(value) => field.onChange(value[0])}
                                className="w-full"
                                data-testid="slider-energy-impact"
                              />
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-red-500">Draining</span>
                                <span 
                                  className={`font-medium ${
                                    (field.value || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                                  }`}
                                  data-testid="text-energy-value"
                                >
                                  {field.value || 0}
                                </span>
                                <span className="text-green-500">Energizing</span>
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-priority">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="High">High</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="Low">Low</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="daysOfWeek"
                      render={() => (
                        <FormItem className="col-span-2">
                          <FormLabel>Days of Week</FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {DAYS_OF_WEEK.map((day) => (
                              <FormField
                                key={day}
                                control={form.control}
                                name="daysOfWeek"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={day}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(day.toLowerCase()) || false}
                                          onCheckedChange={(checked) => {
                                            const value = field.value || [];
                                            return checked
                                              ? field.onChange([...value, day.toLowerCase()])
                                              : field.onChange(value.filter((val) => val !== day.toLowerCase()));
                                          }}
                                          data-testid={`checkbox-${day.toLowerCase()}`}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-sm font-normal">
                                        {day.slice(0,3)}
                                      </FormLabel>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Description (optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Enter description" 
                              {...field} 
                              value={field.value || ""} 
                              data-testid="textarea-description" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createTaskMutation.isPending}
                      data-testid="button-submit"
                    >
                      {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Main content area */}
        <div className="col-span-3 space-y-6">
          {/* Weekly Matrix */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Weekly Matrix
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WeeklyMatrix />
            </CardContent>
          </Card>

          {/* Periodic Recurring */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="h-5 w-5" />
                Periodic Recurring
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PeriodicRecurring />
            </CardContent>
          </Card>
        </div>

        {/* Task Library Sidebar */}
        <div className="col-span-1">
          <TaskLibrarySidebar />
        </div>
      </div>
    </div>
  );
}