import React, { useState, useCallback, useRef, useEffect } from "react";
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
  CalendarDays,
  Upload,
  FileText,
  Image,
  MessageSquare,
  Send,
  Bot,
  User,
  CheckCircle,
  Download,
  X,
  Loader2,
  Library,
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RecurringTask, RecurringSchedule, InsertRecurringTask } from "@shared/schema";
import { insertRecurringTaskSchema } from "@shared/schema";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

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

// AI Assistant types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ExtractedRecurringTask {
  id: string;
  taskName: string;
  taskType: "Milestone" | "Sub-Milestone" | "Task" | "Subtask";
  timeBlock: string;
  daysOfWeek: string[];
  category: "Personal" | "Business";
  subcategory: string;
  durationMinutes: number;
  energyImpact: number;
  priority: "High" | "Medium" | "Low";
  description?: string;
  tags?: string[];
  selected: boolean;
  source: 'file' | 'chat';
}

export default function RecurringTasksPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<"weekly" | "monthly" | "quarterly" | "yearly">("weekly");
  const [draggedTask, setDraggedTask] = useState<RecurringTask | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<RecurringTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<RecurringTask | null>(null);
  const isMobile = useIsMobile();
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem('recurring-tasks-panel-collapsed');
    return saved ? JSON.parse(saved) : isMobile;
  });
  const [selectedTaskForScheduling, setSelectedTaskForScheduling] = useState<RecurringTask | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("library");
  
  // AI Assistant state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<ExtractedRecurringTask[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Persist panel collapse state to localStorage and respond to mobile changes
  useEffect(() => {
    localStorage.setItem('recurring-tasks-panel-collapsed', JSON.stringify(isPanelCollapsed));
  }, [isPanelCollapsed]);

  // Auto-collapse panel on mobile breakpoint change
  useEffect(() => {
    if (isMobile && !isPanelCollapsed) {
      setIsPanelCollapsed(true);
    }
  }, [isMobile]);

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
    onSuccess: async (createdTask, taskData) => {
      // Auto-create schedules if days and time block are selected
      if (taskData.daysOfWeek && taskData.daysOfWeek.length > 0 && taskData.timeBlock) {
        for (const dayName of taskData.daysOfWeek) {
          const dayIndex = DAYS_OF_WEEK.findIndex(day => 
            day.toLowerCase() === dayName.toLowerCase()
          );
          
          if (dayIndex !== -1) {
            const scheduleData = {
              recurringTaskId: createdTask.id,
              scheduleType: "weekly" as const,
              dayOfWeek: dayIndex,
              timeBlock: taskData.timeBlock,
              isActive: true,
            };
            
            try {
              await apiRequest("POST", "/api/recurring/schedule", scheduleData);
            } catch (error) {
              console.error('Failed to create schedule for', dayName, ':', error);
            }
          }
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring/schedule'] });
      toast({
        title: "Task created!",
        description: taskData.daysOfWeek && taskData.daysOfWeek.length > 0 && taskData.timeBlock 
          ? `Task created and scheduled for ${taskData.daysOfWeek.length} day(s)`
          : "Recurring task created successfully.",
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

  // Update recurring task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, taskData }: { id: string; taskData: InsertRecurringTask }) => {
      const response = await apiRequest("PUT", `/api/recurring-tasks/${id}`, taskData);
      return response.json();
    },
    onSuccess: async (updatedTask, { id, taskData }) => {
      // Remove existing schedules for this task
      const existingSchedules = recurringSchedules.filter(schedule => schedule.recurringTaskId === id);
      for (const schedule of existingSchedules) {
        try {
          await apiRequest("DELETE", `/api/recurring/schedule/${schedule.id}`);
        } catch (error) {
          console.error('Failed to remove existing schedule:', error);
        }
      }
      
      // Auto-create new schedules if days and time block are selected
      if (taskData.daysOfWeek && taskData.daysOfWeek.length > 0 && taskData.timeBlock) {
        for (const dayName of taskData.daysOfWeek) {
          const dayIndex = DAYS_OF_WEEK.findIndex(day => 
            day.toLowerCase() === dayName.toLowerCase()
          );
          
          if (dayIndex !== -1) {
            const scheduleData = {
              recurringTaskId: id,
              scheduleType: "weekly" as const,
              dayOfWeek: dayIndex,
              timeBlock: taskData.timeBlock,
              isActive: true,
            };
            
            try {
              await apiRequest("POST", "/api/recurring/schedule", scheduleData);
            } catch (error) {
              console.error('Failed to create schedule for', dayName, ':', error);
            }
          }
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring/schedule'] });
      toast({
        title: "Task updated!",
        description: taskData.daysOfWeek && taskData.daysOfWeek.length > 0 && taskData.timeBlock 
          ? `Task updated and scheduled for ${taskData.daysOfWeek.length} day(s)`
          : "Recurring task updated successfully.",
      });
      setEditingTask(null);
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error updating task",
        description: error.message || "Failed to update task",
        variant: "destructive",
      });
    },
  });

  // Delete recurring task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest("DELETE", `/api/recurring-tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring/schedule'] });
      toast({
        title: "Task deleted!",
        description: "Recurring task deleted successfully.",
      });
      setTaskToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting task",
        description: error.message || "Failed to delete task",
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
    if (editingTask) {
      updateTaskMutation.mutate({ id: editingTask.id, taskData: data });
    } else {
      createTaskMutation.mutate(data);
    }
  };

  // Function to start editing a task
  const startEditingTask = (task: RecurringTask) => {
    setEditingTask(task);
    // Populate the form with the task data
    form.reset({
      taskName: task.taskName,
      taskType: task.taskType,
      timeBlock: task.timeBlock || "",
      daysOfWeek: task.daysOfWeek || [],
      category: task.category,
      subcategory: task.subcategory,
      durationMinutes: task.durationMinutes,
      energyImpact: task.energyImpact,
      priority: task.priority,
      description: task.description || "",
      tags: task.tags || [],
      isActive: task.isActive,
    });
    setIsCreateDialogOpen(true);
  };

  // Function to handle dialog close
  const handleDialogClose = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) {
      setEditingTask(null);
      form.reset();
    }
  };

  // Function to handle task deletion
  const handleDeleteTask = (task: RecurringTask) => {
    setTaskToDelete(task);
  };

  // Function to confirm task deletion
  const confirmDeleteTask = () => {
    if (taskToDelete) {
      deleteTaskMutation.mutate(taskToDelete.id);
    }
  };

  // AI Assistant functions
  const handleFileUpload = useCallback(async (files: File[]) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/recurring-tasks/extract', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to process files');
      }

      const result = await response.json();
      const newExtractedTasks: ExtractedRecurringTask[] = result.tasks.map((task: any, index: number) => ({
        id: `extracted-${Date.now()}-${index}`,
        taskName: task.name || task.taskName || '',
        taskType: task.type || task.taskType || 'Task',
        timeBlock: task.timeBlock || 'FLEXIBLE BLOCK (8-10PM)',
        daysOfWeek: task.daysOfWeek || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        category: task.category || 'Personal',
        subcategory: task.subcategory || 'Physical',
        durationMinutes: task.durationMinutes || Math.round((task.estimatedTime || 1) * 60),
        energyImpact: task.energyImpact || 0,
        priority: task.priority || 'Medium',
        description: task.description || task.why || '',
        tags: task.tags || [],
        selected: true,
        source: 'file' as const,
      }));

      setExtractedTasks(prev => [...prev, ...newExtractedTasks]);
      setUploadedFiles(prev => [...prev, ...files]);

      // Add system message about uploaded files
      const systemMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        role: 'assistant',
        content: `Successfully processed ${files.length} file(s) and extracted ${newExtractedTasks.length} recurring tasks. You can now modify them using chat commands or apply them to your schedule.`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, systemMessage]);

      toast({
        title: "Files processed successfully",
        description: `Extracted ${newExtractedTasks.length} recurring tasks`,
      });
    } catch (error: any) {
      console.error('File upload error:', error);
      toast({
        title: "Error processing files",
        description: error.message || "Failed to process uploaded files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  const handleChatSubmit = async (message: string) => {
    if (!message.trim() || isChatLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message.trim(),
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/recurring-tasks/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          context: {
            extractedTasks,
            uploadedFiles: uploadedFiles.map(f => ({ name: f.name, type: f.type, size: f.size })),
            recurringTasks: recurringTasks.slice(0, 10), // Send limited context
          }
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to process chat message');
      }

      const result = await response.json();
      
      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response || "I understand your request.",
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, assistantMessage]);

      // Apply any task modifications from the AI response
      if (result.modifiedTasks) {
        setExtractedTasks(result.modifiedTasks.map((task: any) => ({
          ...task,
          id: task.id || `modified-${Date.now()}-${Math.random()}`,
          selected: task.selected !== undefined ? task.selected : true,
        })));
      }

    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleApplyTasks = async () => {
    const selectedTasks = extractedTasks.filter(task => task.selected);
    if (selectedTasks.length === 0) {
      toast({
        title: "No tasks selected",
        description: "Please select at least one task to apply",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert extracted tasks to recurring task format and create them
      for (const task of selectedTasks) {
        const taskData: InsertRecurringTask = {
          taskName: task.taskName,
          taskType: task.taskType,
          timeBlock: task.timeBlock,
          daysOfWeek: task.daysOfWeek,
          category: task.category,
          subcategory: task.subcategory as any,
          durationMinutes: task.durationMinutes,
          energyImpact: task.energyImpact,
          priority: task.priority,
          description: task.description || '',
          tags: task.tags || [],
          isActive: true,
        };
        
        // Create the recurring task first
        const response = await apiRequest("POST", "/api/recurring-tasks", taskData);
        const createdTask = await response.json();
        
        // Create schedule entries for each specified day of the week
        for (const dayName of task.daysOfWeek) {
          const dayIndex = DAYS_OF_WEEK.findIndex(day => 
            day.toLowerCase() === dayName.toLowerCase()
          );
          
          if (dayIndex !== -1) {
            const scheduleData = {
              recurringTaskId: createdTask.id,
              scheduleType: "weekly" as const,
              dayOfWeek: dayIndex,
              timeBlock: task.timeBlock,
              isActive: true,
            };
            
            await apiRequest("POST", "/api/recurring/schedule", scheduleData);
          }
        }
      }

      // Refresh both recurring tasks and schedules
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring/schedule'] });
      
      // Clear applied tasks
      setExtractedTasks(prev => prev.filter(task => !task.selected));
      
      toast({
        title: "Tasks applied successfully",
        description: `Added ${selectedTasks.length} recurring tasks to your schedule`,
      });
    } catch (error: any) {
      console.error('Apply tasks error:', error);
      toast({
        title: "Error applying tasks",
        description: error.message || "Failed to apply selected tasks",
        variant: "destructive",
      });
    }
  };

  const handleDragStart = (task: RecurringTask, e: React.DragEvent) => {
    console.log('Drag started for task:', task.taskName);
    setDraggedTask(task);
    setIsDragging(true);
    // Store task data in dataTransfer for cross-component drag and drop
    e.dataTransfer.setData('application/json', JSON.stringify(task));
    e.dataTransfer.setData('text/plain', JSON.stringify(task)); // Add fallback format
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    console.log('Drag ended');
    setDraggedTask(null);
    setIsDragging(false);
  };

  // Mobile scheduling function
  const handleMobileSchedule = (task: RecurringTask, dayIndex: number, timeBlock: string) => {
    const scheduleData = {
      recurringTaskId: task.id,
      scheduleType: "weekly" as const,
      dayOfWeek: dayIndex,
      timeBlock: timeBlock,
      isActive: true,
    };
    
    createScheduleMutation.mutate(scheduleData);
    setIsScheduleModalOpen(false);
    setSelectedTaskForScheduling(null);
  };

  const handleDrop = (dayIndex: number, timeBlock: string, e: React.DragEvent) => {
    e.preventDefault();
    console.log('Drop event triggered on:', dayIndex, timeBlock);
    
    let taskToSchedule = draggedTask;
    
    // If state-based draggedTask is not available (cross-overlay scenario),
    // try to get task data from dataTransfer
    if (!taskToSchedule) {
      try {
        const taskData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
        console.log('Parsing task data from dataTransfer:', taskData);
        if (taskData) {
          taskToSchedule = JSON.parse(taskData);
        }
      } catch (error) {
        console.error('Failed to parse dragged task data:', error);
        return;
      }
    }
    
    if (!taskToSchedule) return;
    
    // Create a weekly recurring schedule
    const scheduleData = {
      recurringTaskId: taskToSchedule.id,
      scheduleType: "weekly" as const,
      dayOfWeek: dayIndex,
      timeBlock: timeBlock,
      isActive: true,
    };
    
    createScheduleMutation.mutate(scheduleData);
    setDraggedTask(null);
    setIsDragging(false);
  };

  const TaskCard = ({ task }: { task: RecurringTask }) => {
    const taskCardContent = (
      <Card 
        className={`mb-2 ${!isMobile ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} border-l-4 border-l-primary transition-opacity ${
          draggedTask?.id === task.id ? 'opacity-50' : 'opacity-100'
        }`}
        draggable={!isMobile}
        onDragStart={!isMobile ? (e) => handleDragStart(task, e) : undefined}
        onDragEnd={!isMobile ? handleDragEnd : undefined}
        onClick={isMobile ? () => {
          setSelectedTaskForScheduling(task);
          setIsScheduleModalOpen(true);
        } : undefined}
        data-testid={`task-card-${task.id}`}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {!isMobile && <GripVertical className="h-3 w-3 text-muted-foreground" />}
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
                {isMobile && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedTaskForScheduling(task);
                        setIsScheduleModalOpen(true);
                      }}
                      data-testid={`schedule-task-${task.id}`}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Schedule to...
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => startEditingTask(task)}
                  data-testid={`edit-task-${task.id}`}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDeleteTask(task)}
                  className="text-destructive"
                  data-testid={`delete-task-${task.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    );

    if (isMobile) {
      return (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {taskCardContent}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => {
                setSelectedTaskForScheduling(task);
                setIsScheduleModalOpen(true);
              }}
              data-testid={`context-schedule-${task.id}`}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Schedule to...
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => startEditingTask(task)}
              data-testid={`context-edit-${task.id}`}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Task
            </ContextMenuItem>
            <ContextMenuItem>Duplicate Task</ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleDeleteTask(task)}
              className="text-destructive"
              data-testid={`context-delete-${task.id}`}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Task
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    }

    return taskCardContent;
  };

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
      {TIME_BLOCKS.map((timeBlock) => {
        const cells = [];
        
        // Add time block label
        cells.push(
          <div key={`${timeBlock}-label`} className="text-xs font-medium text-muted-foreground p-2 border-r">
            {timeBlock}
          </div>
        );
        
        // Add day cells
        DAYS_OF_WEEK.forEach((day, dayIndex) => {
          cells.push(
            <div
              key={`${timeBlock}-${day}`}
              className={`min-h-20 p-2 border border-dashed rounded transition-colors ${
                draggedTask 
                  ? 'border-primary/50 bg-primary/5 hover:bg-primary/10' 
                  : 'border-muted-foreground/20 hover:bg-muted/50'
              }`}
              onDrop={(e) => {
                handleDrop(dayIndex, timeBlock, e);
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
                    <div 
                      key={schedule.id} 
                      className="text-xs bg-primary/10 border border-primary/20 rounded p-1 mb-1 cursor-pointer hover:bg-primary/20 hover:border-primary/30 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingTask(task);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          startEditingTask(task);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit recurring task: ${task.taskName}`}
                      title={`Click to edit ${task.taskName}`}
                      data-testid={`edit-scheduled-task-${schedule.id}`}
                    >
                      <div className="font-medium">{task.taskName}</div>
                      <div className="text-muted-foreground">{Math.round(task.durationMinutes/60*10)/10}h</div>
                    </div>
                  );
                })}
            </div>
          );
        });
        
        return cells;
      })}
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
                        <DropdownMenuItem
                          onClick={() => {
                            const taskToEdit = recurringTasks.find(t => t.id === schedule.recurringTaskId);
                            if (taskToEdit) startEditingTask(taskToEdit);
                          }}
                          data-testid={`edit-schedule-${schedule.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Schedule
                        </DropdownMenuItem>
                        <DropdownMenuItem>Skip Next</DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const taskToRemove = recurringTasks.find(t => t.id === schedule.recurringTaskId);
                            if (taskToRemove) handleDeleteTask(taskToRemove);
                          }}
                          className="text-destructive"
                          data-testid={`remove-schedule-${schedule.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
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


  // AI Recurring Assistant Component
  const AIRecurringAssistant = () => {
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const files = Array.from(e.dataTransfer.files);
      const validFiles = files.filter(file => {
        const validTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/jpg'];
        return validTypes.includes(file.type);
      });
      
      if (validFiles.length > 0) {
        handleFileUpload(validFiles);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload PDF, TXT, DOC, JPG, or PNG files only",
          variant: "destructive",
        });
      }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        handleFileUpload(files);
      }
    };

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    };

    const toggleTaskSelection = (taskId: string) => {
      setExtractedTasks(prev => 
        prev.map(task => 
          task.id === taskId ? { ...task, selected: !task.selected } : task
        )
      );
    };

    const selectedTasksCount = extractedTasks.filter(task => task.selected).length;

    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Recurring Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-6">
          {/* File Upload Area */}
          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Files
            </h3>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isUploading 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              data-testid="upload-area"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.doc,.docx,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="file-input"
              />
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Processing files...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-6 w-6" />
                    <Image className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium">Drop files or click to upload</p>
                  <p className="text-xs text-muted-foreground">
                    PDF, TXT, DOC, JPG, PNG supported
                  </p>
                </div>
              )}
            </div>
            
            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Uploaded Files:</p>
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs bg-muted p-2 rounded">
                    <FileText className="h-3 w-3" />
                    <span className="flex-1 truncate">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== index))}
                      data-testid={`remove-file-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Chat Interface */}
          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat Commands
            </h3>
            
            {/* Chat Messages */}
            <ScrollArea className="h-48 border rounded-lg">
              <div className="p-3 space-y-3">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-muted-foreground">
                    <p className="text-sm">Upload files or ask me to help with recurring tasks</p>
                    <p className="text-xs mt-1">Try: "Change all business tasks to morning blocks"</p>
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        message.role === 'user' ? 'bg-primary' : 'bg-muted'
                      }`}>
                        {message.role === 'user' ? (
                          <User className="h-3 w-3 text-primary-foreground" />
                        ) : (
                          <Bot className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className={`max-w-[80%] ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                        <div className={`rounded-lg p-2 text-xs ${
                          message.role === 'user' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {message.content}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Chat Input */}
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask me to modify tasks..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit(chatInput);
                  }
                }}
                disabled={isChatLoading}
                data-testid="chat-input"
              />
              <Button
                size="sm"
                onClick={() => handleChatSubmit(chatInput)}
                disabled={!chatInput.trim() || isChatLoading}
                data-testid="chat-send"
              >
                {isChatLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Extracted Tasks Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Extracted Tasks ({extractedTasks.length})
              </h3>
              {selectedTasksCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleApplyTasks}
                  className="text-xs"
                  data-testid="apply-tasks"
                >
                  Apply {selectedTasksCount} Tasks
                </Button>
              )}
            </div>
            
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-3">
                {extractedTasks.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Download className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No tasks extracted yet</p>
                    <p className="text-xs">Upload files to get started</p>
                  </div>
                ) : (
                  extractedTasks.map((task) => (
                    <Card key={task.id} className={`p-3 border-l-4 ${
                      task.source === 'file' ? 'border-l-blue-500' : 'border-l-green-500'
                    } ${!task.selected ? 'opacity-60' : ''}`}>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={task.selected}
                            onCheckedChange={() => toggleTaskSelection(task.id)}
                            className="mt-0.5"
                            data-testid={`task-checkbox-${task.id}`}
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{task.taskName}</span>
                              <Badge variant="outline" className="text-xs">
                                {task.taskType}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary" className="text-xs">
                                {task.category}
                              </Badge>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {Math.round(task.durationMinutes/60*10)/10}h
                              </span>
                              <span 
                                className={`flex items-center gap-1 font-medium ${
                                  task.energyImpact >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {task.energyImpact >= 0 ? '+' : ''}{task.energyImpact}
                              </span>
                            </div>
                            
                            <div className="text-xs text-muted-foreground">
                              {task.timeBlock} • {task.daysOfWeek.join(', ')}
                            </div>
                            
                            {task.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            
                            {task.tags && task.tags.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {task.tags.map((tag, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    );
  };

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

  // Sticky Top Panel Component
  const StickyTopPanel = () => {

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const files = Array.from(e.dataTransfer.files);
      const validFiles = files.filter(file => {
        const validTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/jpg'];
        return validTypes.includes(file.type);
      });
      
      if (validFiles.length > 0) {
        handleFileUpload(validFiles);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload PDF, TXT, DOC, JPG, or PNG files only",
          variant: "destructive",
        });
      }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        handleFileUpload(files);
      }
    };

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    };

    const toggleTaskSelection = (taskId: string) => {
      setExtractedTasks(prev => 
        prev.map(task => 
          task.id === taskId ? { ...task, selected: !task.selected } : task
        )
      );
    };

    const selectedTasksCount = extractedTasks.filter(task => task.selected).length;

    return (
      <Card className="sticky top-0 z-40 mb-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className={`font-semibold ${
                isMobile ? 'text-base' : 'text-lg'
              }`}>Task Management</h2>
              {isMobile && (
                <Badge variant="secondary" className="text-xs">
                  {isPanelCollapsed ? 'Collapsed' : 'Expanded'}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              data-testid="toggle-panel-collapse"
            >
              {isPanelCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {!isPanelCollapsed && (
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="library" data-testid="tab-library">
                  <Library className="h-4 w-4 mr-2" />
                  Library
                </TabsTrigger>
                <TabsTrigger value="ai-assistant" data-testid="tab-ai-assistant">
                  <Bot className="h-4 w-4 mr-2" />
                  AI Assistant
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="library" className="mt-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {isMobile 
                        ? 'Tap tasks or use context menu to schedule them'
                        : 'Drag tasks to the Weekly Matrix to schedule them'
                      }
                    </p>
                  </div>
                  <div className={`relative ${
                    isMobile ? 'h-32' : 'h-40'
                  }`}>
                    {tasksLoading ? (
                      <div className="flex space-x-3 overflow-x-auto pb-2">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="flex-shrink-0 w-80 h-32 bg-muted animate-pulse rounded" />
                        ))}
                      </div>
                    ) : (
                      <div 
                        className={`flex space-x-3 overflow-x-auto pb-2 h-full ${
                          isMobile ? 'scroll-smooth' : ''
                        }`}
                        style={{
                          scrollbarWidth: isMobile ? 'thin' : 'auto',
                          WebkitOverflowScrolling: 'touch'
                        }} 
                        data-testid="row-task-library"
                      >
                        {recurringTasks.map((task: RecurringTask) => (
                          <div key={task.id} className={`flex-shrink-0 ${
                            isMobile ? 'w-64 min-w-[16rem]' : 'w-80'
                          }`}>
                            <TaskCard task={task} />
                          </div>
                        ))}
                        {recurringTasks.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground flex-1">
                            <Repeat className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No recurring tasks yet</p>
                            <p className="text-xs">Create your first recurring task</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="ai-assistant" className="mt-4">
                <div className="space-y-6">
                  {/* File Upload Area */}
                  <div className="space-y-3">
                    <h3 className="font-medium flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload Files
                    </h3>
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        isUploading 
                          ? 'border-primary bg-primary/5' 
                          : 'border-muted-foreground/25 hover:border-primary/50'
                      }`}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      role="button"
                      data-testid="upload-area"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.txt,.doc,.docx,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={handleFileSelect}
                        data-testid="file-input"
                      />
                      {isUploading ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">Processing files...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex gap-2">
                            <FileText className="h-6 w-6 text-muted-foreground" />
                            <Image className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium">Drop files here or click to upload</p>
                          <p className="text-xs text-muted-foreground">PDF, TXT, DOC, JPG, PNG files supported</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Chat Interface */}
                  <div className="space-y-3">
                    <h3 className="font-medium flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Chat with AI
                    </h3>
                    <div className="border rounded-lg">
                      <ScrollArea className="h-48 p-4">
                        {chatMessages.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Start a conversation with the AI</p>
                            <p className="text-xs">Upload files or ask questions about recurring tasks</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {chatMessages.map((message) => (
                              <div key={message.id} className={`flex gap-3 ${
                                message.role === 'user' ? 'justify-end' : 'justify-start'
                              }`}>
                                <div className={`flex gap-2 max-w-[80%] ${
                                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                                }`}>
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                    message.role === 'user' 
                                      ? 'bg-primary text-primary-foreground' 
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {message.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                                  </div>
                                  <div className={`rounded-lg px-3 py-2 text-sm ${
                                    message.role === 'user'
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted'
                                  }`}>
                                    <p>{message.content}</p>
                                    <p className="text-xs opacity-70 mt-1">
                                      {formatTime(message.timestamp)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {isChatLoading && (
                              <div className="flex gap-3 justify-start">
                                <div className="flex gap-2">
                                  <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs">
                                    <Bot className="h-3 w-3" />
                                  </div>
                                  <div className="rounded-lg px-3 py-2 text-sm bg-muted">
                                    <div className="flex items-center gap-2">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      <span>Thinking...</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </ScrollArea>
                      <div className="border-t p-3">
                        <div className="flex gap-2">
                          <Input
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Ask me anything about recurring tasks..."
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleChatSubmit(chatInput);
                              }
                            }}
                            disabled={isChatLoading}
                            data-testid="input-chat"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleChatSubmit(chatInput)}
                            disabled={!chatInput.trim() || isChatLoading}
                            data-testid="button-send-chat"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Extracted Tasks */}
                  {extractedTasks.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Extracted Tasks ({selectedTasksCount} selected)
                        </h3>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setExtractedTasks([])}
                            data-testid="button-clear-tasks"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Clear
                          </Button>
                          <Button 
                            size="sm"
                            onClick={handleApplyTasks}
                            disabled={selectedTasksCount === 0}
                            data-testid="button-apply-tasks"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Apply ({selectedTasksCount})
                          </Button>
                        </div>
                      </div>
                      <ScrollArea className="h-48 border rounded-lg">
                        <div className="p-4 space-y-2">
                          {extractedTasks.map((task) => (
                            <Card 
                              key={task.id} 
                              className={`p-3 cursor-pointer transition-colors ${
                                task.selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                              }`}
                              onClick={() => toggleTaskSelection(task.id)}
                              data-testid={`extracted-task-${task.id}`}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={task.selected}
                                  onChange={() => toggleTaskSelection(task.id)}
                                  data-testid={`checkbox-task-${task.id}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-medium text-sm truncate">{task.taskName}</h4>
                                    <Badge variant="outline" className="text-xs">
                                      {task.taskType}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                      {task.priority}
                                    </Badge>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {Math.round(task.durationMinutes/60*10)/10}h
                                    </span>
                                    <span 
                                      className={`flex items-center gap-1 font-medium ${
                                        task.energyImpact >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}
                                    >
                                      {task.energyImpact >= 0 ? '+' : ''}{task.energyImpact}
                                    </span>
                                  </div>
                                  
                                  <div className="text-xs text-muted-foreground">
                                    {task.timeBlock} • {task.daysOfWeek.join(', ')}
                                  </div>
                                  
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {task.description}
                                    </p>
                                  )}
                                  
                                  {task.tags && task.tags.length > 0 && (
                                    <div className="flex gap-1 flex-wrap">
                                      {task.tags.map((tag, index) => (
                                        <Badge key={index} variant="secondary" className="text-xs">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </Card>
    );
  };

  // Mobile Scheduling Modal Component
  const MobileScheduleModal = () => (
    <Dialog open={isScheduleModalOpen} onOpenChange={setIsScheduleModalOpen}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Task</DialogTitle>
        </DialogHeader>
        {selectedTaskForScheduling && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <h4 className="font-medium text-sm mb-1">{selectedTaskForScheduling.taskName}</h4>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">
                  {selectedTaskForScheduling.taskType}
                </Badge>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {Math.round(selectedTaskForScheduling.durationMinutes/60*10)/10}h
                </span>
              </div>
            </div>
            
            <div className="space-y-3">
              <h5 className="font-medium text-sm">Select Day & Time</h5>
              <div className="grid gap-2">
                {TIME_BLOCKS.map((timeBlock) => (
                  <div key={timeBlock} className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground px-2">
                      {timeBlock}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {DAYS_OF_WEEK.slice(0, 7).map((day, dayIndex) => (
                        <Button
                          key={`${timeBlock}-${day}`}
                          variant="outline"
                          size="sm"
                          className="h-auto p-2 text-xs"
                          onClick={() => handleMobileSchedule(selectedTaskForScheduling, dayIndex, timeBlock)}
                          data-testid={`mobile-schedule-${dayIndex}-${timeBlock}`}
                        >
                          {day.slice(0, 3)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsScheduleModalOpen(false);
                  setSelectedTaskForScheduling(null);
                }}
                data-testid="cancel-mobile-schedule"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <div className={`p-6 space-y-6 ${isMobile ? 'p-4 space-y-4' : ''}`}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recurring Tasks</h1>
        <div className="flex gap-2">
          <Dialog open={isCreateDialogOpen} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-recurring">
                <Plus className="h-4 w-4 mr-2" />
                Create Recurring Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingTask ? 'Edit Recurring Task' : 'Create New Recurring Task'}
                </DialogTitle>
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
                      name="quarter"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quarter (within Time Block)</FormLabel>
                          <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger data-testid="select-quarter">
                                <SelectValue placeholder="Select quarter" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">Q1 (First 25%)</SelectItem>
                              <SelectItem value="2">Q2 (Second 25%)</SelectItem>
                              <SelectItem value="3">Q3 (Third 25%)</SelectItem>
                              <SelectItem value="4">Q4 (Fourth 25%)</SelectItem>
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
                                step={25}
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

                  <div className="flex justify-between">
                    <div>
                      {editingTask && (
                        <Button 
                          type="button" 
                          variant="destructive" 
                          onClick={() => handleDeleteTask(editingTask)}
                          data-testid="button-delete-task"
                        >
                          Delete Task
                        </Button>
                      )}
                    </div>
                    <div className="flex space-x-2">
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
                        {editingTask 
                          ? (updateTaskMutation.isPending ? "Updating..." : "Update Task")
                          : (createTaskMutation.isPending ? "Creating..." : "Create Task")
                        }
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Sticky Top Panel */}
      <StickyTopPanel />
      <MobileScheduleModal />

      {/* Main Content - Full Width */}
      <div className="space-y-6">
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{taskToDelete?.taskName}"? This action cannot be undone.
              All associated schedules will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete"
            >
              {deleteTaskMutation.isPending ? "Deleting..." : "Delete Task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}