import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, Plus, Minus, Camera, Calendar, ChevronDown, ChevronUp, Target, Info, Trash2, CalendarDays, Clock, User } from "lucide-react";
import { AIChatPanel } from "./ai-chat-panel";
import { isToday } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TIME_BLOCKS as CANONICAL_TIME_BLOCKS, BACKLOG_TIME_BLOCK } from "@shared/schema";

// Convert canonical TIME_BLOCKS to frontend format with time display and quartiles
const TIME_BLOCKS = CANONICAL_TIME_BLOCKS.map(block => ({
  name: block.name,
  time: `${block.start}-${block.end}`,
  quartiles: 4
}));

// Drag and drop item types
const ItemTypes = {
  TASK: 'task',
};

// Draggable task component with enhanced visual feedback and leaf-only scheduling
function DraggableTask({ task, children, taskTree }: { task: any; children: React.ReactNode; taskTree?: any }) {
  // Check if this task has children (making it non-draggable)
  const hasChildren = taskTree?.children[task.id]?.length > 0;
  
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.TASK,
    item: { 
      entryId: task.entryId, // Include the schedule entry ID
      taskId: task.id, 
      taskName: task.name,
      sourceTimeBlock: task.timeBlock,
      sourceQuartile: task.quartile,
      hasChildren
    },
    canDrag: taskTree ? !hasChildren : false, // Prevent dragging parent tasks AND wait for tree data
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [task.entryId, task.id, task.name, task.timeBlock, task.quartile, hasChildren, taskTree]);

  // Different styles for non-draggable parent tasks and loading states
  const getTaskStyles = () => {
    if (!taskTree) {
      // Loading state - prevent interaction until tree data arrives
      return {
        opacity: 0.5,
        cursor: 'wait',
        backgroundColor: 'rgba(156, 163, 175, 0.05)',
        border: '2px dashed rgba(156, 163, 175, 0.2)',
        borderRadius: '6px',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      };
    }
    
    if (hasChildren) {
      return {
        opacity: 0.6,
        cursor: 'not-allowed',
        backgroundColor: 'rgba(156, 163, 175, 0.1)',
        border: '2px dashed rgba(156, 163, 175, 0.4)',
        borderRadius: '6px',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      };
    }
    
    return {
      opacity: isDragging ? 0.7 : 1,
      transform: isDragging ? 'scale(0.95) rotate(2deg)' : 'scale(1) rotate(0deg)',
      cursor: isDragging ? 'grabbing' : 'grab',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: isDragging ? 
        '0 8px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(59, 130, 246, 0.5)' : 
        '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      borderRadius: '6px',
      zIndex: isDragging ? 1000 : 'auto',
    };
  };

  return (
    <div
      ref={taskTree && !hasChildren ? drag : undefined}
      style={getTaskStyles()}
      className={`
        relative
        ${isDragging ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}
        ${hasChildren ? 'ring-2 ring-gray-400 ring-opacity-30' : ''}
        ${!taskTree ? 'ring-2 ring-blue-400 ring-opacity-20' : ''}
      `}
      data-testid={`draggable-task-${task.id}`}
      title={
        !taskTree ? 'Loading hierarchy data...' :
        hasChildren ? 'Cannot schedule parent tasks - only leaf tasks can be scheduled' : 
        undefined
      }
    >
      {children}
      {!taskTree && (
        <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1 py-0.5 rounded-full">
          Loading
        </div>
      )}
      {taskTree && hasChildren && (
        <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs px-1 py-0.5 rounded-full">
          Parent
        </div>
      )}
    </div>
  );
}

// Enhanced drop zone component for quartiles with better visual feedback
function QuartileDropZone({ 
  children, 
  timeBlock, 
  quartile, 
  onDrop,
  isOccupied = false,
  taskTree
}: { 
  children: React.ReactNode; 
  timeBlock: string; 
  quartile: number; 
  onDrop: (item: any, timeBlock: string, quartile: number) => void;
  isOccupied?: boolean;
  taskTree?: any;
}) {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: ItemTypes.TASK,
    drop: (item: any) => {
      if (!isOccupied) {
        onDrop(item, timeBlock, quartile);
      }
    },
    canDrop: (item, monitor) => {
      if (isOccupied) return false;
      // Drop-time revalidation: always check current taskTree state
      const currentHasChildren = taskTree?.children[item.taskId]?.length > 0;
      return !currentHasChildren;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [isOccupied, onDrop, timeBlock, quartile, taskTree]);

  // Determine visual state
  const getDropZoneStyles = () => {
    if (isOver && canDrop) {
      // Valid drop zone being hovered
      return {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        border: '2px dashed rgba(34, 197, 94, 0.6)',
        boxShadow: '0 0 20px rgba(34, 197, 94, 0.2)',
        transform: 'scale(1.02)',
      };
    } else if (isOver && !canDrop) {
      // Occupied drop zone being hovered
      return {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        border: '2px dashed rgba(239, 68, 68, 0.6)',
        boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)',
        transform: 'scale(0.98)',
      };
    } else if (isOccupied) {
      // Occupied but not being hovered
      return {
        backgroundColor: 'rgba(156, 163, 175, 0.05)',
        border: '2px dashed rgba(156, 163, 175, 0.3)',
        boxShadow: 'none',
        transform: 'scale(1)',
      };
    } else {
      // Available drop zone
      return {
        backgroundColor: 'transparent',
        border: '2px dashed transparent',
        boxShadow: 'none',
        transform: 'scale(1)',
      };
    }
  };

  return (
    <div
      ref={drop}
      style={{
        ...getDropZoneStyles(),
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRadius: '8px',
        minHeight: '60px',
        cursor: isOver ? (canDrop ? 'copy' : 'not-allowed') : 'default',
      }}
      data-testid={`dropzone-${timeBlock}-${quartile}`}
      className={`
        ${isOver && canDrop ? 'animate-pulse' : ''}
        ${isOver && !canDrop ? 'animate-bounce' : ''}
      `}
    >
      {children}
    </div>
  );
}

// Enhanced drop zone component for backlog with better visual feedback
function BacklogDropZone({ 
  children, 
  onDrop,
  taskTree
}: { 
  children: React.ReactNode; 
  onDrop: (item: any, timeBlock: string, quartile: number) => void;
  taskTree?: any;
}) {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: ItemTypes.TASK,
    drop: (item: any) => {
      onDrop(item, BACKLOG_TIME_BLOCK, 0);
    },
    canDrop: (item, monitor) => {
      // Drop-time revalidation: always check current taskTree state
      const currentHasChildren = taskTree?.children[item.taskId]?.length > 0;
      return !currentHasChildren;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [onDrop, taskTree]);

  // Enhanced visual feedback for backlog
  const getBacklogStyles = () => {
    if (isOver && canDrop) {
      return {
        backgroundColor: 'rgba(251, 191, 36, 0.2)',
        border: '3px dashed rgba(245, 158, 11, 0.8)',
        boxShadow: '0 0 25px rgba(245, 158, 11, 0.3), inset 0 0 20px rgba(251, 191, 36, 0.1)',
        transform: 'scale(1.03)',
      };
    } else {
      return {
        backgroundColor: 'rgba(251, 191, 36, 0.05)',
        border: '2px dashed rgba(245, 158, 11, 0.3)',
        boxShadow: 'none',
        transform: 'scale(1)',
      };
    }
  };

  return (
    <div
      ref={drop}
      style={{
        ...getBacklogStyles(),
        borderRadius: '12px',
        minHeight: '80px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: isOver ? 'copy' : 'default',
        position: 'relative',
      }}
      className={`
        ${isOver ? 'animate-pulse' : ''}
        backdrop-blur-sm
      `}
      data-testid="dropzone-backlog"
    >
      {/* Animated background pattern */}
      {isOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.1) 0px, rgba(245, 158, 11, 0.1) 10px, transparent 10px, transparent 20px)',
            borderRadius: '12px',
            animation: 'slide 1s infinite linear',
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

interface DailyScheduleEntry {
  id?: string;
  timeBlock: string;
  quartile: number;
  plannedTaskId?: string;
  actualTaskId?: string;
  status: "not_started" | "in_progress" | "completed";
  reflection?: string;
}

export default function DailyWorksheet() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [workTimerRunning, setWorkTimerRunning] = useState(false);
  const [breakTimerRunning, setBreakTimerRunning] = useState(false);
  const [workTime, setWorkTime] = useState(0); // seconds
  const [breakTime, setBreakTime] = useState(0); // seconds
  const [totalWorkTime, setTotalWorkTime] = useState(0); // total seconds worked today
  const [totalBreakTime, setTotalBreakTime] = useState(0); // total seconds on break today
  const baseExpenditure = -2300; // Base Metabolic Rate (constant)
  const [quickTask, setQuickTask] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  // Remove legacy outcomes collapse state (replaced by panel-level collapse)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Manual multi-add state
  const [showAddTaskFor, setShowAddTaskFor] = useState<{timeBlock: string, quartile: number} | null>(null);
  
  // Remove task confirmation dialog state
  const [removeTaskDialog, setRemoveTaskDialog] = useState<{
    open: boolean;
    task: any;
    entry: DailyScheduleEntry;
    timeBlock: string;
    quartile: number;
    isPlanned: boolean;
  } | null>(null);
  const [skipRecurringToday, setSkipRecurringToday] = useState(true);
  
  // Clear schedule confirmation dialog
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // Current date/time widget
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  
  // Top panel state
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('daily-panel-collapsed') || 'false');
    } catch {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('daily-panel-active-tab') || 'today-tasks';
    } catch {
      return 'today-tasks';
    }
  });
  
  // Client-side skip registry for recurring tasks (per-date)
  const [skippedRecurring, setSkippedRecurring] = useState<Map<string, Set<string>>>(() => {
    const map = new Map();
    try {
      const saved = localStorage.getItem('skippedRecurring');
      if (saved) {
        const skipArray = JSON.parse(saved);
        map.set('global', new Set(skipArray));
      }
    } catch (e) {
      console.warn('Failed to load skipped recurring tasks from localStorage:', e);
    }
    return map;
  });
  
  const { toast } = useToast();

  // Update current date/time every second (using NY timezone)
  useEffect(() => {
    const updateNYTime = () => {
      const nyTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      setCurrentDateTime(new Date(nyTimeStr));
    };
    
    updateNYTime(); // Set initial value
    const interval = setInterval(updateNYTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Timer effect for work timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (workTimerRunning) {
      interval = setInterval(() => {
        setWorkTime(prev => prev + 1);
        setTotalWorkTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [workTimerRunning]);

  // Timer effect for break timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (breakTimerRunning) {
      interval = setInterval(() => {
        setBreakTime(prev => prev + 1);
        setTotalBreakTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [breakTimerRunning]);

  // Load and save daily timer totals
  useEffect(() => {
    const savedTotals = localStorage.getItem(`timerTotals:${selectedDate}`);
    if (savedTotals) {
      try {
        const parsed = JSON.parse(savedTotals);
        setTotalWorkTime(parsed.totalWork || 0);
        setTotalBreakTime(parsed.totalBreak || 0);
      } catch (e) {
        console.warn('Failed to load timer totals for date:', selectedDate);
      }
    } else {
      setTotalWorkTime(0);
      setTotalBreakTime(0);
    }
    // Reset current session times when date changes
    setWorkTime(0);
    setBreakTime(0);
    setWorkTimerRunning(false);
    setBreakTimerRunning(false);
  }, [selectedDate]);

  // Save daily timer totals to localStorage
  useEffect(() => {
    const totals = {
      totalWork: totalWorkTime,
      totalBreak: totalBreakTime
    };
    localStorage.setItem(`timerTotals:${selectedDate}`, JSON.stringify(totals));
  }, [totalWorkTime, totalBreakTime, selectedDate]);

  // Handle task removal from schedule
  const handleRemoveTask = async (dialogData: {
    task: any;
    entry: DailyScheduleEntry;
    timeBlock: string;
    quartile: number;
    isPlanned: boolean;
    skipRecurring?: boolean;
  }) => {
    const { task, entry, timeBlock, quartile, isPlanned, skipRecurring } = dialogData;
    
    try {
      // Optimistically update the cache to remove the task immediately
      const queryKey = ['/api/daily', selectedDate];
      const previousData = queryClient.getQueryData<DailyScheduleEntry[]>(queryKey);
      
      let updateData: any = { id: entry.id! };
      
      // Handle different task types
      if (task.type === 'recurring') {
        // For recurring tasks, clear the reflection field or modify MULTIPLE_TASKS
        if (entry.reflection?.startsWith('RECURRING_TASK:')) {
          updateData.reflection = null;
        } else if (entry.reflection?.startsWith('MULTIPLE_TASKS:')) {
          // Remove this specific task from MULTIPLE_TASKS list by index (pipe-delimited format)
          const taskNamesStr = entry.reflection.replace('MULTIPLE_TASKS:', '');
          const taskNames = taskNamesStr.split('|').map(name => name.trim());
          
          // Extract index from task ID for multiple tasks (format: "multiple-TimeBlock-Quartile-index")
          if (task.source === 'multiple_tasks' && task.id.includes('-')) {
            const index = parseInt(task.id.split('-').pop() || '0');
            if (index >= 0 && index < taskNames.length) {
              taskNames.splice(index, 1); // Remove by index
            }
          }
          
          updateData.reflection = taskNames.length > 0 
            ? `MULTIPLE_TASKS:${taskNames.join('|')}`
            : null;
        }
      } else {
        // For regular tasks, clear the appropriate ID field
        updateData[isPlanned ? 'plannedTaskId' : 'actualTaskId'] = null;
      }
      
      // Update cache optimistically
      if (previousData) {
        const updatedData = previousData.map(item => 
          item.id === entry.id 
            ? { ...item, ...updateData }
            : item
        );
        queryClient.setQueryData(queryKey, updatedData);
      }

      // If skipping recurring task, add to skip registry
      if (skipRecurring && task.type === 'recurring') {
        // Find the actual recurring task to get its ID
        let recurringTaskId = null;
        
        if (task.source === 'multiple_tasks') {
          // For multiple tasks, find the matching recurring task by timeBlock, quartile, and name
          const matchingRecurring = recurringTasks.find(rt => 
            rt.timeBlock === timeBlock && 
            rt.quartiles?.includes(quartile) &&
            (rt.taskName || rt.name) === task.name
          );
          recurringTaskId = matchingRecurring?.id || `name:${task.name}`;
        } else if (task.source === 'recurring_active' || task.source === 'recurring_candidate') {
          // For single recurring tasks, find by timeBlock, quartile, and name
          const matchingRecurring = recurringTasks.find(rt => 
            rt.timeBlock === timeBlock && 
            rt.quartiles?.includes(quartile) &&
            (rt.taskName || rt.name) === task.name
          );
          recurringTaskId = matchingRecurring?.id || `name:${task.name}`;
        }
        
        if (recurringTaskId) {
          const skipKey = `${selectedDate}:${timeBlock}:${quartile}:${recurringTaskId}`;
          setSkippedRecurring(prev => {
            const newMap = new Map(prev);
            if (!newMap.has('global')) {
              newMap.set('global', new Set());
            }
            newMap.get('global')!.add(skipKey);
            // Persist to localStorage
            localStorage.setItem('skippedRecurring', JSON.stringify(Array.from(newMap.get('global')!)));
            return newMap;
          });

          // Also call backend API to create server-side skip
          try {
            // Find the recurring schedule for this recurring task
            const matchingRecurring = recurringTasks.find(rt => 
              rt.timeBlock === timeBlock && 
              rt.quartiles?.includes(quartile) &&
              (rt.taskName || rt.name) === task.name
            );
            
            if (matchingRecurring?.id) {
              // Call the skip API endpoint
              apiRequest("POST", `/api/recurring/schedule/${matchingRecurring.id}/skip`, {
                date: new Date(selectedDate + 'T00:00:00.000Z').toISOString()
              }).then(() => {
                console.log('Successfully created server-side skip for recurring task');
                // Invalidate recurring tasks cache to reflect the skip
                queryClient.invalidateQueries({ queryKey: ['/api/recurring-tasks'] });
              }).catch(error => {
                console.warn('Failed to create server-side skip:', error);
                // Client-side skip still works, so don't show error to user
              });
            }
          } catch (error) {
            console.warn('Failed to create server-side skip:', error);
          }
        }
      }

      // Make the API call to remove the task
      updateScheduleMutation.mutate(updateData, {
        onError: () => {
          // Rollback on error
          if (previousData) {
            queryClient.setQueryData(queryKey, previousData);
          }
          // Also rollback skip registry on error
          if (skipRecurring && task.type === 'recurring') {
            // Find the same recurring task ID used in the forward path
            let recurringTaskId = null;
            const matchingRecurring = recurringTasks.find(rt => 
              rt.timeBlock === timeBlock && 
              rt.quartiles?.includes(quartile) &&
              (rt.taskName || rt.name) === task.name
            );
            recurringTaskId = matchingRecurring?.id || `name:${task.name}`;
            
            if (recurringTaskId) {
              const skipKey = `${selectedDate}:${timeBlock}:${quartile}:${recurringTaskId}`;
              setSkippedRecurring(prev => {
                const newMap = new Map(prev);
                const globalSet = newMap.get('global');
                if (globalSet) {
                  globalSet.delete(skipKey);
                  localStorage.setItem('skippedRecurring', JSON.stringify(Array.from(globalSet)));
                }
                return newMap;
              });
            }
          }
        }
      });

      toast({
        title: "Task removed",
        description: `Removed "${task.name}" from ${timeBlock} Q${quartile}${skipRecurring ? ' and skipped today' : ''}`,
      });

    } catch (error) {
      console.error('Failed to remove task:', error);
      toast({
        title: "Failed to remove task",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const { data: schedule = [], isLoading: scheduleLoading } = useQuery<DailyScheduleEntry[]>({
    queryKey: ['/api/daily', selectedDate],
    enabled: !!selectedDate,
  });

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ['/api/tasks'],
  });

  // Fetch hierarchy tree for leaf-only scheduling
  const { data: taskTree } = useQuery<{ children: Record<string, string[]>; parents: Record<string, string[]>; tasks: Record<string, any>; roots: string[]; leaves: string[] }>({
    queryKey: ['/api/tasks/tree'],
  });

  // Fetch recurring tasks for display
  const { data: recurringTasks = [] } = useQuery<any[]>({
    queryKey: ['/api/recurring-tasks'],
  });

  // Get completed tasks for the selected date to calculate calories
  const completedTasks = tasks.filter(task => 
    task.status === 'completed' && 
    task.xDate && 
    new Date(task.xDate).toDateString() === new Date(selectedDate).toDateString()
  );

  // Get Today's Outcomes (Milestones and Sub-Milestones due today)
  const outcomesToday = tasks.filter(task => {
    if (!(task.type === 'Milestone' || task.type === 'Sub-Milestone') || !task.xDate) {
      return false;
    }
    
    // Convert both dates to YYYY-MM-DD format for comparison to avoid timezone issues
    const taskDate = new Date(task.xDate).toISOString().split('T')[0];
    const selectedDateFormatted = selectedDate; // selectedDate is already in YYYY-MM-DD format
    
    return taskDate === selectedDateFormatted;
  });


  // Persist top panel collapse state
  useEffect(() => {
    localStorage.setItem('daily-panel-collapsed', JSON.stringify(isPanelCollapsed));
  }, [isPanelCollapsed]);
  
  // Persist active tab state
  useEffect(() => {
    localStorage.setItem('daily-panel-active-tab', activeTab);
  }, [activeTab]);

  // Calculate total calories from completed tasks
  const calculatedCaloricIntake = completedTasks.reduce((total, task) => {
    const intake = parseFloat(task.caloriesIntake) || 0;
    return total + intake;
  }, 0);

  const calculatedCaloricExpenditure = completedTasks.reduce((total, task) => {
    const expenditure = parseFloat(task.caloriesExpenditure) || 0;
    return total - expenditure; // Keep expenditure negative
  }, 0);

  const generateScheduleMutation = useMutation({
    mutationFn: async (date: string) => {
      const response = await apiRequest("POST", "/api/daily/generate", { date });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
      toast({
        title: "Schedule generated",
        description: "AI has created your optimized daily schedule",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to generate schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearScheduleMutation = useMutation({
    mutationFn: async (date: string) => {
      const response = await apiRequest("POST", `/api/daily/clear/${date}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
      toast({
        title: "Schedule cleared",
        description: "All tasks have been removed from today's schedule",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to clear schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async (updates: Partial<DailyScheduleEntry> & { id: string }) => {
      const response = await apiRequest("PUT", "/api/daily/update", updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/tree'] }); // Invalidate tree for hierarchy changes
    },
    onError: (error) => {
      toast({
        title: "Failed to update schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await apiRequest("DELETE", `/api/daily/${entryId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete task");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/tree'] }); // Invalidate tree for hierarchy changes
      toast({
        title: "Task deleted",
        description: "Task has been removed from your schedule",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Create update task status mutation for regular tasks
  const updateTaskStatusMutation = useMutation({
    mutationFn: async (data: { taskId: string; status: string; xDate?: string; scheduleUpdateData?: any }) => {
      const response = await apiRequest("PUT", `/api/tasks/${data.taskId}`, {
        status: data.status,
        ...(data.xDate && { xDate: data.xDate })
      });
      return { taskResponse: response.json(), scheduleUpdateData: data.scheduleUpdateData };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      // If there's schedule update data, chain the schedule update
      if (data.scheduleUpdateData) {
        updateScheduleMutation.mutate(data.scheduleUpdateData);
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Helper function to execute AI actions
  const executeAIActions = async (actions: any[]) => {
    if (!actions || actions.length === 0) return { success: true, failures: [] };

    const results = [];
    const failures = [];

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'move_task':
            if (action.taskId && action.updates) {
              // Map action updates to the format expected by /api/planning/move
              const moveData: any = { taskId: action.taskId };
              
              if (action.updates.timeHorizon || action.updates.newTimeHorizon) {
                moveData.newTimeHorizon = action.updates.newTimeHorizon || action.updates.timeHorizon;
              }
              if (action.updates.category || action.updates.newCategory) {
                moveData.newCategory = action.updates.newCategory || action.updates.category;
              }
              if (action.updates.subcategory || action.updates.newSubcategory) {
                moveData.newSubcategory = action.updates.newSubcategory || action.updates.subcategory;
              }
              if (action.updates.xDate) {
                moveData.xDate = action.updates.xDate;
              }
              
              await apiRequest("POST", "/api/planning/move", moveData);
              results.push({ action, success: true });
            } else {
              failures.push({ action, error: 'Missing taskId or updates' });
            }
            break;
          case 'update_task':
            if (action.taskId && action.updates) {
              await apiRequest("PUT", `/api/tasks/${action.taskId}`, action.updates);
              results.push({ action, success: true });
            } else {
              failures.push({ action, error: 'Missing taskId or updates' });
            }
            break;
          case 'clear_schedule':
            if (action.date) {
              await apiRequest("POST", `/api/daily/clear/${action.date}`);
              results.push({ action, success: true });
            } else {
              failures.push({ action, error: 'Missing date' });
            }
            break;
          case 'remove_from_schedule':
            // For now, skip this action type as endpoint doesn't exist yet
            failures.push({ action, error: 'Remove from schedule not implemented yet' });
            break;
          default:
            failures.push({ action, error: 'Unknown action type' });
        }
      } catch (error) {
        console.error('Error executing action:', action, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failures.push({ action, error: errorMessage });
      }
    }

    return { 
      success: failures.length === 0, 
      failures,
      successCount: results.length 
    };
  };

  const aiChatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", { message });
      return response.json();
    },
    onSuccess: async (data) => {
      // Execute any actions returned by the AI
      if (data.actions && data.actions.length > 0) {
        const result = await executeAIActions(data.actions);
        
        // Invalidate relevant queries after actions are executed
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
        queryClient.invalidateQueries({ queryKey: ['/api/daily'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/tree'] }); // Invalidate tree for hierarchy changes
        
        if (result.success) {
          toast({
            title: "AI Assistant",
            description: `${data.response} ✅ All ${result.successCount} actions completed successfully!`,
          });
        } else {
          toast({
            title: "AI Assistant", 
            description: `${data.response} ⚠️ ${result.failures.length} actions failed. ${result.successCount} succeeded.`,
            variant: "destructive",
          });
          console.error('Action failures:', result.failures);
        }
      } else {
        // No actions to execute, just show response
        toast({
          title: "AI Assistant",
          description: data.response,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "AI request failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskName: string) => {
      const response = await apiRequest("POST", "/api/tasks", {
        name: taskName,
        type: "Task",
        category: "Personal",
        subcategory: "Mental",
        timeHorizon: "Today",
        priority: "Medium",
        estimatedTime: "1",
        why: "Quick captured task",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task created",
        description: "New task added to your list",
      });
      setQuickTask("");
    },
    onError: (error) => {
      toast({
        title: "Failed to create task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleWorkTimerToggle = () => {
    if (breakTimerRunning) {
      setBreakTimerRunning(false);
    }
    
    if (!workTimerRunning) {
      // Starting new work session - reset current session time
      setWorkTime(0);
    }
    
    setWorkTimerRunning(!workTimerRunning);
    toast({
      title: workTimerRunning ? "Work timer stopped" : "Work timer started",
      description: workTimerRunning ? "Work session paused" : "Work session started",
    });
  };

  const handleBreakTimerToggle = () => {
    if (workTimerRunning) {
      setWorkTimerRunning(false);
    }
    
    if (!breakTimerRunning) {
      // Starting new break session - reset current session time
      setBreakTime(0);
    }
    
    setBreakTimerRunning(!breakTimerRunning);
    toast({
      title: breakTimerRunning ? "Break timer stopped" : "Break timer started",
      description: breakTimerRunning ? "Break ended" : "Break started",
    });
  };

  // Format seconds to HH:MM:SS
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Removed handleCalorieUpdate - calories now calculated from completed tasks

  const handleQuickTaskSubmit = () => {
    if (!quickTask.trim()) return;
    createTaskMutation.mutate(quickTask);
  };

  const handleAiMessage = () => {
    if (!aiMessage.trim()) return;
    aiChatMutation.mutate(aiMessage);
    setAiMessage("");
  };

  const getScheduleEntry = (timeBlock: string, quartile: number): DailyScheduleEntry | undefined => {
    return schedule.find((entry) => 
      entry.timeBlock === timeBlock && entry.quartile === quartile
    );
  };

  // Helper to find a recurring task that matches the schedule entry
  const getRecurringTaskForEntry = (entry: DailyScheduleEntry | undefined): any | undefined => {
    if (!entry || entry.plannedTaskId) return undefined;
    
    // Find recurring task that matches this time block and quartile
    return recurringTasks.find((rt) => 
      rt.timeBlock === entry.timeBlock && 
      (!rt.quarter || rt.quarter === entry.quartile)
    );
  };

  // Helper to get task name for display
  const getTaskNameForEntry = (entry: DailyScheduleEntry | undefined): string => {
    if (!entry) return "";
    
    // Skip placeholder entries - these are system-generated fillers, not real tasks
    if (entry.reflection && entry.reflection.startsWith('PLACEHOLDER:')) {
      return "";
    }
    
    // First try to find a regular task
    if (entry.actualTaskId) {
      const task = tasks.find(t => t.id === entry.actualTaskId);
      if (task) return task.name;
    }
    
    if (entry.plannedTaskId) {
      const task = tasks.find(t => t.id === entry.plannedTaskId);
      if (task) return task.name;
    }
    
    // Check for recurring task name stored in reflection field
    if (entry.reflection && entry.reflection.startsWith('RECURRING_TASK:')) {
      return entry.reflection.replace('RECURRING_TASK:', '');
    }
    
    return "";
  };

  // Helper to get all candidate tasks for a quarter (active task + matching recurring tasks)
  const getCandidateTasksForQuarter = (timeBlock: string, quartile: number) => {
    const entry = getScheduleEntry(timeBlock, quartile);
    const selectedDateObj = new Date(selectedDate);
    const dayOfWeek = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    
    const candidates: Array<{
      id: string;
      name: string;
      type: 'regular' | 'recurring';
      isActive: boolean;
      source: string;
      durationMinutes?: number;
      entryId?: string; // Database entry ID for drag-and-drop
    }> = [];
    
    // 1. Add currently active/selected task if it exists and isn't a placeholder or completed
    if (entry && !entry.reflection?.startsWith('PLACEHOLDER:') && entry.status !== 'completed') {
      if (entry.actualTaskId) {
        const task = tasks.find(t => t.id === entry.actualTaskId);
        // Always add the candidate, even if task is not found in tasks array
        candidates.push({
          id: entry.actualTaskId,
          name: task?.name || `Task ${entry.actualTaskId.slice(0, 8)}...`, // Fallback name if task not found
          type: 'regular',
          isActive: true,
          source: 'active',
          entryId: entry.id // Add the database entry ID
        });
      } else if (entry.plannedTaskId) {
        const task = tasks.find(t => t.id === entry.plannedTaskId);
        // Always add the candidate, even if task is not found in tasks array
        candidates.push({
          id: entry.plannedTaskId,
          name: task?.name || `Task ${entry.plannedTaskId.slice(0, 8)}...`, // Fallback name if task not found
          type: 'regular',
          isActive: true,
          source: 'planned',
          entryId: entry.id // Add the database entry ID
        });
      } else if (entry.reflection?.startsWith('RECURRING_TASK:')) {
        const taskName = entry.reflection.replace('RECURRING_TASK:', '');
        candidates.push({
          id: `recurring-${timeBlock}-${quartile}`,
          name: taskName,
          type: 'recurring',
          isActive: true,
          source: 'recurring_active',
          entryId: entry.id // Add the database entry ID
        });
      } else if (entry.reflection?.startsWith('MULTIPLE_TASKS:')) {
        // Handle multiple tasks from AI scheduler
        const taskNamesStr = entry.reflection.replace('MULTIPLE_TASKS:', '');
        const taskNames = taskNamesStr.split('|');
        taskNames.forEach((taskName, index) => {
          candidates.push({
            id: `multiple-${timeBlock}-${quartile}-${index}`,
            name: taskName.trim(),
            type: 'recurring',
            isActive: true,
            source: 'multiple_tasks',
            entryId: entry.id // Add the database entry ID - ALL multiple tasks share the same entry
          });
        });
      }
    }
    
    // 2. Add matching recurring tasks that aren't already active
    const matchingRecurring = recurringTasks.filter(rt => {
      // Don't show recurring tasks if this entry is already completed
      if (entry?.status === 'completed') return false;
      
      // Check if this recurring task is skipped for today
      const skipKey = `${selectedDate}:${timeBlock}:${quartile}:${rt.id}`;
      const skipKeyFallback = `${selectedDate}:${timeBlock}:${quartile}:name:${rt.taskName || rt.name}`;
      const globalSkipped = skippedRecurring.get('global');
      if (globalSkipped?.has(skipKey) || globalSkipped?.has(skipKeyFallback)) return false;
      
      // Must match time block
      if (rt.timeBlock !== timeBlock) return false;
      
      // Must match quarter (or recurring task has no specific quarter)
      if (rt.quarter && rt.quarter !== quartile) return false;
      
      // Must include today's day of week
      if (!rt.daysOfWeek || !rt.daysOfWeek.includes(dayOfWeek)) return false;
      
      // Don't duplicate already active tasks
      const isAlreadyActive = candidates.some(c => 
        c.name === rt.taskName && c.type === 'recurring'
      );
      
      return !isAlreadyActive;
    });
    
    // Add recurring tasks as candidates
    matchingRecurring.forEach(rt => {
      candidates.push({
        id: rt.id,
        name: rt.taskName,
        type: 'recurring',
        isActive: false,
        source: 'recurring_candidate',
        durationMinutes: rt.durationMinutes
        // No entryId - these don't have database entries yet
      });
    });
    
    
    return candidates;
  };

  // Helper to get backlog tasks (tasks moved to BACKLOG_TIME_BLOCK with quartile 0)
  const getBacklogTasks = () => {
    const backlogEntries = schedule.filter(entry => 
      entry.timeBlock === BACKLOG_TIME_BLOCK && 
      entry.quartile === 0 &&
      !entry.reflection?.startsWith('PLACEHOLDER:') &&
      entry.status !== 'completed'
    );

    const backlogTasks = backlogEntries.map(entry => {
      let task = null;
      let taskName = '';
      let originalTimeBlock = 'Unknown';

      // Try to find the actual task data
      if (entry.actualTaskId) {
        task = tasks.find(t => t.id === entry.actualTaskId);
        taskName = task?.name || `Task ${entry.actualTaskId.slice(0, 8)}...`;
      } else if (entry.plannedTaskId) {
        task = tasks.find(t => t.id === entry.plannedTaskId);
        taskName = task?.name || `Task ${entry.plannedTaskId.slice(0, 8)}...`;
      } else if (entry.reflection?.startsWith('RECURRING_TASK:')) {
        taskName = entry.reflection.replace('RECURRING_TASK:', '');
      }

      // Extract original time block from reflection if available
      if (entry.reflection?.includes('FROM:')) {
        const match = entry.reflection.match(/FROM:([^|]+)/);
        if (match) originalTimeBlock = match[1].trim();
      }

      return {
        id: entry.id || `${selectedDate}:backlog:${entry.actualTaskId || entry.plannedTaskId || taskName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`,
        entryId: entry.id,
        taskId: entry.actualTaskId || entry.plannedTaskId,
        name: taskName,
        originalTimeBlock,
        priority: task?.priority || 'Medium',
        category: task?.category || 'Personal',
        subcategory: task?.subcategory || '',
        status: entry.status,
        reflection: entry.reflection
      };
    }).filter(item => item.name); // Only include items with valid names

    return backlogTasks;
  };

  const getCompletedTasks = () => {
    return schedule.filter((entry) => entry.status === 'completed').length;
  };

  const getTotalQuartiles = () => {
    return TIME_BLOCKS.reduce((total, block) => total + block.quartiles, 0);
  };

  const completionRate = getTotalQuartiles() > 0 ? (getCompletedTasks() / getTotalQuartiles()) * 100 : 0;

  // Helper to get selected task details
  const selectedTask = selectedTaskId ? tasks.find(task => task.id === selectedTaskId) : null;

  // Close modal handler
  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedTaskId(null);
  };

  // Helper functions for task matching
  const isSynthetic = (taskId: string) => taskId.startsWith('recurring-') || taskId.startsWith('multiple-');
  const buildKey = (taskId: string) => isSynthetic(taskId) ? `synthetic:${taskId}` : `task:${taskId}`;
  const matchesTask = (entry: any, taskId: string) => {
    if (!isSynthetic(taskId)) {
      return entry.actualTaskId === taskId || entry.plannedTaskId === taskId;
    } else if (taskId.startsWith('recurring-')) {
      // Single recurring tasks are stored as RECURRING_TASK:TaskName
      // The ID format is: recurring-TIMEBLOCK-QUARTILE
      // Need to handle timeBlocks with underscores like PHYSICAL_MENTAL
      const prefix = 'recurring-';
      const withoutPrefix = taskId.substring(prefix.length);
      const lastDashIndex = withoutPrefix.lastIndexOf('-');
      
      if (lastDashIndex > 0) {
        const timeBlock = withoutPrefix.substring(0, lastDashIndex);
        const quartile = parseInt(withoutPrefix.substring(lastDashIndex + 1));
        
        return entry.timeBlock === timeBlock && 
               entry.quartile === quartile && 
               (entry.reflection || '').startsWith('RECURRING_TASK:');
      }
      return false;
    } else if (taskId.startsWith('multiple-')) {
      // Multiple tasks format: multiple-TIMEBLOCK-QUARTILE-INDEX
      // Need similar parsing for multiple tasks
      const prefix = 'multiple-';
      const withoutPrefix = taskId.substring(prefix.length);
      const lastDashIndex = withoutPrefix.lastIndexOf('-');
      
      if (lastDashIndex > 0) {
        const beforeLastDash = withoutPrefix.substring(0, lastDashIndex);
        const secondLastDashIndex = beforeLastDash.lastIndexOf('-');
        
        if (secondLastDashIndex > 0) {
          const timeBlock = beforeLastDash.substring(0, secondLastDashIndex);
          const quartile = parseInt(beforeLastDash.substring(secondLastDashIndex + 1));
          
          return entry.timeBlock === timeBlock && 
                 entry.quartile === quartile && 
                 (entry.reflection || '').startsWith('MULTIPLE_TASKS:');
        }
      }
      return false;
    } else {
      return (entry.reflection || '').includes(`KEY=${buildKey(taskId)}`);
    }
  };

  // Find existing task location across all dates
  const findTaskLocationAcrossAllDates = async (taskId: string) => {
    // First check current date schedule
    const currentDateEntry = schedule.find((e: any) => matchesTask(e, taskId));
    if (currentDateEntry) {
      return { entry: currentDateEntry, date: selectedDate };
    }
    
    // If not found in current date, check previous and next few days
    const dates = [
      new Date(Date.now() - 86400000).toISOString().split('T')[0], // yesterday
      new Date(Date.now()).toISOString().split('T')[0], // today
      new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
      new Date(Date.now() + 172800000).toISOString().split('T')[0], // day after tomorrow
    ];
    
    for (const date of dates) {
      if (date === selectedDate) continue; // already checked
      try {
        const response = await fetch(`/api/daily/${date}`);
        if (response.ok) {
          const otherSchedule = await response.json();
          const foundEntry = otherSchedule.find((e: any) => matchesTask(e, taskId));
          if (foundEntry) {
            return { entry: foundEntry, date };
          }
        }
      } catch (error) {
        // Continue checking other dates
      }
    }
    return null;
  };

  // Handle task drop onto quartile or backlog
  const handleTaskDrop = async (item: any, timeBlock: string, quartile: number) => {
    const { entryId, taskId, taskName, sourceTimeBlock, sourceQuartile } = item;
    
    console.log('handleTaskDrop called with:', {
      entryId,
      taskId,
      taskName,
      sourceTimeBlock,
      sourceQuartile,
      targetTimeBlock: timeBlock,
      targetQuartile: quartile
    });
    
    try {
      // Early return if dropping to same location
      if (sourceTimeBlock === timeBlock && sourceQuartile === quartile) {
        console.log('Dropping to same location, ignoring');
        return;
      }
      
      // Drop-time revalidation: Check if task has children using current taskTree state
      const currentHasChildren = !!(taskTree && taskTree.children && taskTree.children[taskId] && taskTree.children[taskId].length > 0);
      if (currentHasChildren) {
        toast({
          title: "Cannot schedule parent task",
          description: "Only leaf tasks (tasks without children) can be scheduled. Please schedule the individual subtasks instead.",
          variant: "destructive"
        });
        return;
      }
      
      // Check if destination quartile is occupied (except when moving to backlog)
      if (timeBlock !== BACKLOG_TIME_BLOCK) {
        const destinationEntry = getScheduleEntry(timeBlock, quartile);
        if (destinationEntry && (destinationEntry.actualTaskId || destinationEntry.plannedTaskId || destinationEntry.reflection)) {
          const occupyingTask = tasks.find(t => 
            t.id === destinationEntry.actualTaskId || t.id === destinationEntry.plannedTaskId
          );
          const occupyingTaskName = occupyingTask?.name || 'another task';
          
          toast({
            title: "Cannot drop here",
            description: `${timeBlock} Q${quartile} is already occupied by ${occupyingTaskName}. Try a different quartile or move to backlog.`,
            variant: "destructive"
          });
          return;
        }
      }
      
      // Try to find the entry ID if not provided (fallback for production issues)
      let finalEntryId = entryId;
      if (!finalEntryId && sourceTimeBlock && sourceQuartile !== undefined) {
        console.log('No entryId provided, trying to find it from schedule');
        
        // First try: Direct match by timeBlock and quartile (most reliable for drag operations)
        const foundEntry = schedule.find((e: any) => 
          e.timeBlock === sourceTimeBlock &&
          e.quartile === sourceQuartile
        );
        
        if (foundEntry) {
          finalEntryId = foundEntry.id;
          console.log('Found entry ID by timeBlock/quartile match:', finalEntryId);
        } else if (taskId) {
          // Second try: Use matchesTask if we have a taskId
          const foundByTaskId = schedule.find((e: any) => 
            matchesTask(e, taskId) &&
            e.timeBlock === sourceTimeBlock &&
            e.quartile === sourceQuartile
          );
          if (foundByTaskId) {
            finalEntryId = foundByTaskId.id;
            console.log('Found entry ID by task match:', finalEntryId);
          }
        }
        
        if (!finalEntryId) {
          console.log('Could not find matching entry in schedule for:', { taskId, sourceTimeBlock, sourceQuartile });
          console.log('Available schedule entries:', schedule.map(e => ({
            id: e.id,
            timeBlock: e.timeBlock,
            quartile: e.quartile,
            actualTaskId: e.actualTaskId,
            plannedTaskId: e.plannedTaskId,
            reflection: e.reflection
          })));
        }
      }
      
      if (finalEntryId) {
        // We have an existing entry ID - just update it directly
        console.log('Using entryId to update existing entry:', finalEntryId);
        const updateData: any = {
          id: finalEntryId,
          timeBlock: timeBlock,
          quartile: quartile,
        };
        
        // Add FROM metadata when moving to backlog
        if (timeBlock === BACKLOG_TIME_BLOCK && sourceTimeBlock && sourceTimeBlock !== BACKLOG_TIME_BLOCK) {
          const currentEntry = schedule.find((e: any) => e.id === finalEntryId);
          updateData.reflection = (currentEntry?.reflection || '') + ` FROM:${sourceTimeBlock}`;
        }
        
        console.log('Updating with data:', updateData);
        updateScheduleMutation.mutate(updateData);
        toast({
          title: timeBlock === BACKLOG_TIME_BLOCK ? "Moved to backlog" : "Task moved",
          description: timeBlock === BACKLOG_TIME_BLOCK 
            ? "Task has been moved to backlog for rescheduling"
            : `Task moved to ${timeBlock} Q${quartile}`,
        });
      } else {
        // No entry ID - this is a new task being added from outside (shouldn't happen for backlog moves)
        if (timeBlock === BACKLOG_TIME_BLOCK) {
          toast({
            title: "Cannot add to backlog",
            description: "Only scheduled tasks can be moved to backlog",
            variant: "destructive"
          });
          return;
        }
        
        // Create new entry for non-backlog destinations
        const createData: any = {
          timeBlock: timeBlock,
          quartile: quartile,
          status: 'not_started',
          date: new Date(selectedDate + 'T00:00:00.000Z'),
        };
        
        if (taskId && !isSynthetic(taskId)) {
          createData.plannedTaskId = taskId;
          createData.actualTaskId = taskId;
        }
        
        const response = await apiRequest("POST", "/api/daily", createData);
        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
          toast({
            title: "Task scheduled",
            description: `Task assigned to ${timeBlock} Q${quartile}`,
          });
        }
      }
    } catch (error) {
      console.error('Failed to move task:', error);
      toast({
        title: "Failed to move task",
        description: "Could not update task location",
        variant: "destructive",
      });
    }
  };

  // Check if a task is scheduled in any quartile
  const getTaskScheduleInfo = (taskId: string) => {
    const scheduledEntry = schedule.find((entry: any) => matchesTask(entry, taskId));
    return scheduledEntry ? {
      timeBlock: scheduledEntry.timeBlock,
      quartile: scheduledEntry.quartile
    } : null;
  };

  // Handle deleting a backlog task
  const handleDeleteBacklogTask = (entryId: string, taskName: string) => {
    if (confirm(`Are you sure you want to delete "${taskName}" from your backlog?`)) {
      deleteScheduleMutation.mutate(entryId);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
    <div className="space-y-6">
      {/* Daily Overview Panel */}
      <Card className="sticky top-0 z-40 mb-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg">Daily Overview</h2>
              <Badge variant="secondary" className="text-xs">
                {isPanelCollapsed ? 'Collapsed' : 'Expanded'}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              data-testid="toggle-daily-panel-collapse"
            >
              {isPanelCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {!isPanelCollapsed && (
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="today-tasks" data-testid="tab-today-tasks">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Today's Tasks
                </TabsTrigger>
                <TabsTrigger value="today-outcomes" data-testid="tab-today-outcomes">
                  <Target className="h-4 w-4 mr-2" />
                  Today's Outcomes
                </TabsTrigger>
                <TabsTrigger value="today-backlog" data-testid="tab-today-backlog">
                  <Clock className="h-4 w-4 mr-2" />
                  Today's Backlog
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="today-tasks" className="mt-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Tasks planned for today from your strategic planning matrix
                    </p>
                  </div>
                  <div className="relative h-40">
                    <ScrollArea className="h-full">
                      <div className="space-y-2 pr-4">
                        {tasks.filter(task => {
                          // Use same criteria as Planning page: timeHorizon = "Today" AND xDate is today
                          const hasTimeHorizonToday = task.timeHorizon === 'Today';
                          const hasWorkDateToday = task.xDate && isToday(new Date(task.xDate));
                          // Only show actionable tasks, not milestones/outcomes
                          return hasTimeHorizonToday && hasWorkDateToday && task.type !== 'Milestone' && task.type !== 'Sub-Milestone';
                        }).length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No tasks scheduled for today</p>
                            <p className="text-xs">Tasks will appear here when scheduled</p>
                          </div>
                        ) : (
                          tasks.filter(task => {
                            // Use same criteria as Planning page: timeHorizon = "Today" AND xDate is today
                            const hasTimeHorizonToday = task.timeHorizon === 'Today';
                            const hasWorkDateToday = task.xDate && isToday(new Date(task.xDate));
                            // Only show actionable tasks, not milestones/outcomes
                            return hasTimeHorizonToday && hasWorkDateToday && task.type !== 'Milestone' && task.type !== 'Sub-Milestone';
                          }).map((task) => (
                            <DraggableTask key={task.id} task={{
                              ...task,
                              entryId: schedule.find((e: any) => 
                                (e.actualTaskId === task.id || e.plannedTaskId === task.id) &&
                                e.timeBlock !== BACKLOG_TIME_BLOCK
                              )?.id
                            }} taskTree={taskTree}>
                              <div
                                className="flex items-center gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors"
                                data-testid={`row-today-task-${task.id}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-medium text-sm truncate" data-testid={`text-task-name-${task.id}`}>{task.name}</h4>
                                    <Badge variant="outline" className="text-xs" data-testid={`badge-task-priority-${task.id}`}>
                                      {task.priority}
                                    </Badge>
                                    {task.category && (
                                      <Badge variant="secondary" className="text-xs" data-testid={`badge-task-category-${task.id}`}>
                                        {task.category}
                                      </Badge>
                                    )}
                                    {/* Show scheduling indicator */}
                                    {(() => {
                                      const scheduleInfo = getTaskScheduleInfo(task.id);
                                      return scheduleInfo ? (
                                        <Badge variant="default" className="text-xs bg-blue-500 hover:bg-blue-600">
                                          {scheduleInfo.timeBlock} Q{scheduleInfo.quartile}
                                        </Badge>
                                      ) : null;
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      <span>{task.estimatedTime}h</span>
                                    </div>
                                    {task.dueDate && (
                                      <div className="flex items-center gap-1">
                                        <CalendarDays className="h-3 w-3" />
                                        <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </DraggableTask>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="today-outcomes" className="mt-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Milestones and deliverables due today
                    </p>
                  </div>
                  <div className="relative h-40">
                    <ScrollArea className="h-full">
                      <div className="space-y-2 pr-4">
                        {outcomesToday.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground" data-testid="status-no-outcomes">
                            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No outcomes due today</p>
                            <p className="text-xs">Milestones and deliverables will appear here</p>
                          </div>
                        ) : (
                          outcomesToday.map((outcome) => (
                            <div
                              key={outcome.id}
                              className="flex items-start gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors"
                              data-testid={`row-outcome-${outcome.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium text-sm truncate" data-testid={`text-outcome-name-${outcome.id}`}>{outcome.name}</h4>
                                  <Badge variant="outline" className="text-xs" data-testid={`badge-outcome-type-${outcome.id}`}>
                                    {outcome.type}
                                  </Badge>
                                  {outcome.category && (
                                    <Badge variant="secondary" className="text-xs" data-testid={`badge-outcome-category-${outcome.id}`}>
                                      {outcome.category}
                                    </Badge>
                                  )}
                                  {outcome.subcategory && (
                                    <Badge variant="secondary" className="text-xs" data-testid={`badge-outcome-subcategory-${outcome.id}`}>
                                      {outcome.subcategory}
                                    </Badge>
                                  )}
                                </div>
                                {outcome.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {outcome.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="today-backlog" className="mt-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Tasks moved to backlog that you still want to complete today
                    </p>
                  </div>
                  <BacklogDropZone onDrop={handleTaskDrop} taskTree={taskTree}>
                    <div className="border rounded-lg p-4 min-h-[200px] bg-muted/20">
                      {(() => {
                        const backlogTasks = getBacklogTasks();
                        
                        if (backlogTasks.length === 0) {
                          return (
                            <div className="text-center py-8">
                              <p className="text-sm text-muted-foreground">
                                Drag incomplete tasks here to reschedule them later
                              </p>
                              <p className="text-xs text-muted-foreground mt-2">
                                Tasks in backlog can be dragged back to any available quartile
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-3">
                            <p className="text-xs text-muted-foreground mb-3">
                              {backlogTasks.length} task{backlogTasks.length !== 1 ? 's' : ''} in backlog
                            </p>
                            <ScrollArea className="h-[400px] w-full pr-4">
                              <div className="space-y-2">
                              {backlogTasks.map((task) => (
                                <DraggableTask key={task.id} task={{ 
                                  id: task.taskId || task.id, 
                                  name: task.name,
                                  entryId: task.entryId,
                                  timeBlock: BACKLOG_TIME_BLOCK,
                                  quartile: 0
                                }} taskTree={taskTree}>
                                  <div
                                    className="flex items-center gap-3 p-3 mb-2 rounded-lg border bg-card hover:bg-card/80 transition-colors"
                                    data-testid={`row-backlog-task-${task.id}`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium text-sm truncate" data-testid={`text-backlog-task-name-${task.id}`}>
                                          {task.name}
                                        </h4>
                                        <Badge variant="outline" className="text-xs" data-testid={`badge-task-priority-${task.id}`}>
                                          {task.priority}
                                        </Badge>
                                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800" data-testid={`badge-original-timeblock-${task.id}`}>
                                          From: {task.originalTimeBlock}
                                        </Badge>
                                      </div>
                                      {task.category && (
                                        <div className="flex items-center gap-2">
                                          <Badge variant="secondary" className="text-xs" data-testid={`badge-task-category-${task.id}`}>
                                            {task.category}
                                          </Badge>
                                          {task.subcategory && (
                                            <Badge variant="secondary" className="text-xs" data-testid={`badge-task-subcategory-${task.id}`}>
                                              {task.subcategory}
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (task.entryId) {
                                          handleDeleteBacklogTask(task.entryId, task.name);
                                        }
                                      }}
                                      className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                                      data-testid={`button-delete-backlog-task-${task.id}`}
                                      disabled={!task.entryId}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </DraggableTask>
                              ))}
                              </div>
                            </ScrollArea>
                          </div>
                        );
                      })()}
                    </div>
                  </BacklogDropZone>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </Card>

      {/* Top Controls - Sticky Positioned */}
      <Card className="sticky top-0 z-50 bg-background border-b shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap gap-3 sm:gap-4 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 sm:gap-6">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-auto"
                  data-testid="input-date-selector"
                />
              </div>
              <div className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-muted/50 rounded-md border" data-testid="widget-current-datetime">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium leading-none">
                    {currentDateTime.toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                  <span className="text-lg font-mono font-bold leading-none mt-1">
                    {currentDateTime.toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit', 
                      second: '2-digit',
                      hour12: true 
                    })}
                    <span className="text-xs text-muted-foreground ml-1 font-normal">NY</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Work:</span>
                <span className="font-mono font-medium ml-1" data-testid="text-total-work-time">{formatTime(totalWorkTime)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Now:</span>
                <span className="font-mono font-medium ml-1" data-testid="text-current-work-time">{formatTime(workTime)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Break:</span>
                <span className="font-mono font-medium ml-1" data-testid="text-total-break-time">{formatTime(totalBreakTime)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Now:</span>
                <span className="font-mono font-medium ml-1" data-testid="text-current-break-time">{formatTime(breakTime)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleWorkTimerToggle} data-testid="button-work-timer-toggle" variant={workTimerRunning ? "default" : "outline"} size="sm">
                {workTimerRunning ? (
                  <>
                    <Pause className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Pause Work</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Start Work</span>
                  </>
                )}
              </Button>
              <Button onClick={handleBreakTimerToggle} data-testid="button-break-timer-toggle" variant={breakTimerRunning ? "default" : "outline"} size="sm">
                {breakTimerRunning ? (
                  <>
                    <Pause className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">End Break</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Start Break</span>
                  </>
                )}
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => generateScheduleMutation.mutate(selectedDate)}
                disabled={generateScheduleMutation.isPending}
                data-testid="button-generate-schedule"
              >
                <span className="hidden sm:inline">Generate AI Schedule</span>
                <span className="sm:hidden">AI Schedule</span>
              </Button>
              <Button 
                variant="destructive"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[CLEAR SCHEDULE] Button clicked!', { showClearConfirm, isPending: clearScheduleMutation.isPending });
                  setShowClearConfirm(true);
                }}
                disabled={clearScheduleMutation.isPending}
                data-testid="button-clear-schedule"
                type="button"
              >
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Clear Schedule</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Time Blocks */}
        <div className="xl:col-span-3 space-y-4">
          {TIME_BLOCKS.map((block) => (
            <Card key={block.name} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base">{block.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">{block.time}</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-4 gap-px bg-border">
                  {Array.from({ length: block.quartiles }, (_, index) => {
                    const quartile = index + 1;
                    const entry = getScheduleEntry(block.name, quartile);
                    const candidates = getCandidateTasksForQuarter(block.name, quartile);
                    const visibleTasks = candidates.slice(0, 4); // Show max 4 tasks
                    const hiddenCount = Math.max(0, candidates.length - 4);
                    
                    // Debug logging for MULTIPLE_TASKS (dev only)
                    if (import.meta.env.DEV && entry?.reflection?.startsWith('MULTIPLE_TASKS:')) {
                      console.log(`[DEBUG] ${block.name} Q${quartile} - MULTIPLE_TASKS entry:`, {
                        reflection: entry.reflection,
                        candidates: candidates.length,
                        visibleTasks: visibleTasks.length,
                        candidateDetails: candidates.map(c => ({ id: c.id, name: c.name, type: c.type, isActive: c.isActive }))
                      });
                    }
                    
                    return (
                      <QuartileDropZone
                        key={quartile}
                        timeBlock={block.name}
                        quartile={quartile}
                        onDrop={handleTaskDrop}
                        isOccupied={visibleTasks.length > 0}
                        taskTree={taskTree}
                      >
                        <div className={`bg-card p-2 ${entry?.status === 'in_progress' ? 'border-2 border-primary' : ''}`}>
                        {/* Compact header */}
                        <div className={`text-xs mb-2 font-medium ${entry?.status === 'in_progress' ? 'text-primary' : 'text-muted-foreground'}`}>
                          Q{quartile} {entry?.status === 'in_progress' && '• ACTIVE'}
                        </div>
                        
                        {/* Task stack */}
                        <div className="space-y-1">
                          {visibleTasks.length === 0 ? (
                            // Empty quarter - show compact task selector
                            <Select 
                              value={entry?.actualTaskId || entry?.plannedTaskId || ""} 
                              onValueChange={async (taskId) => {
                                console.log('Combobox selection:', { entryId: entry?.id, taskId, blockName: block.name, quartile });
                                if (taskId) {
                                  if (entry?.id) {
                                    // Update existing entry
                                    console.log('Updating existing entry:', { id: entry.id, actualTaskId: taskId });
                                    updateScheduleMutation.mutate({
                                      id: entry.id,
                                      actualTaskId: taskId,
                                      status: 'not_started',
                                    });
                                  } else {
                                    // Create new entry first, then update it
                                    console.log('Creating new schedule entry for:', { blockName: block.name, quartile, taskId });
                                    try {
                                      const response = await apiRequest("POST", "/api/daily", {
                                        timeBlock: block.name,
                                        quartile: quartile,
                                        plannedTaskId: taskId,
                                        actualTaskId: taskId,
                                        status: 'not_started',
                                        date: new Date(selectedDate + 'T00:00:00.000Z')
                                      });
                                      if (response.ok) {
                                        console.log('Successfully created new schedule entry');
                                        // Invalidate cache to refresh the schedule data
                                        queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
                                      }
                                    } catch (error) {
                                      console.error('Failed to create schedule entry:', error);
                                      toast({
                                        title: "Failed to assign task",
                                        description: "Could not create schedule entry",
                                        variant: "destructive",
                                      });
                                    }
                                  }
                                } else {
                                  console.log('No taskId provided');
                                }
                              }}
                            >
                              <SelectTrigger className="w-full text-xs h-6" data-testid={`select-task-${block.name}-${quartile}`}>
                                <SelectValue placeholder="Select task..." />
                              </SelectTrigger>
                              <SelectContent>
                                {tasks
                                  .filter(task => task.type === 'Task' || task.type === 'Subtask')
                                  .map((task) => (
                                    <SelectItem key={task.id} value={task.id}>
                                      {task.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            // Show task rows
                            <>
                              {visibleTasks.map((task, taskIndex) => {
                                // Find the correct entry for this specific task
                                const taskEntry = schedule.find((e: any) => 
                                  (e.actualTaskId === task.id || e.plannedTaskId === task.id) &&
                                  e.timeBlock === block.name &&
                                  e.quartile === quartile
                                );
                                return (
                                  <DraggableTask key={task.id} task={{ 
                                    id: task.id, 
                                    name: task.name,
                                    entryId: taskEntry?.id,
                                    timeBlock: block.name,
                                    quartile
                                  }} taskTree={taskTree}>
                                    <div
                                      className={`flex items-center gap-1 p-1 rounded text-xs cursor-pointer hover:bg-secondary/50 ${
                                        task.isActive ? 'bg-primary/10 border border-primary/20' : ''
                                      }`}
                                      onClick={() => {
                                    if (entry?.id) {
                                      if (task.type === 'regular') {
                                        updateScheduleMutation.mutate({
                                          id: entry.id,
                                          actualTaskId: task.id,
                                          status: 'not_started', // Reset status when selecting new task
                                        });
                                      } else if (task.type === 'recurring') {
                                        // Set recurring task as active by storing it in reflection field
                                        updateScheduleMutation.mutate({
                                          id: entry.id,
                                          actualTaskId: undefined,
                                          plannedTaskId: undefined,
                                          reflection: `RECURRING_TASK:${task.name}`,
                                          status: 'not_started', // Reset status when selecting new task
                                        });
                                      }
                                    }
                                  }}
                                  data-testid={`row-task-${block.name}-${quartile}-${taskIndex}`}
                                >
                                  {/* Icon */}
                                  <span className="text-muted-foreground text-xs w-3 flex-shrink-0">
                                    {task.type === 'recurring' ? '⟲' : '•'}
                                  </span>
                                  
                                  {/* Task name */}
                                  <span className="flex-1 truncate line-clamp-1" title={task.name}>
                                    {task.name}
                                  </span>
                                  
                                  {/* Remove button - show for any active task */}
                                  {task.isActive && entry?.id && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive flex-shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRemoveTaskDialog({
                                          open: true,
                                          task,
                                          entry,
                                          timeBlock: block.name,
                                          quartile,
                                          isPlanned: !!entry.plannedTaskId && entry.plannedTaskId === task.id
                                        });
                                      }}
                                      data-testid={`button-remove-${block.name}-${quartile}-${task.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                  
                                  {/* Info button for regular tasks */}
                                  {task.type === 'regular' && task.isActive && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-4 w-4 p-0 hover:bg-secondary/50 flex-shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTaskId(task.id);
                                        setIsDetailsOpen(true);
                                      }}
                                      data-testid={`button-task-info-${block.name}-${quartile}-${taskIndex}`}
                                    >
                                      <Info className="h-3 w-3" />
                                    </Button>
                                  )}
                                  
                                  {/* Duration for recurring tasks */}
                                  {task.durationMinutes && (
                                    <span className="text-xs text-muted-foreground flex-shrink-0">
                                      {task.durationMinutes}m
                                    </span>
                                  )}
                                  
                                  {/* Completion checkbox - only show for active tasks */}
                                  {task.isActive ? (
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <Checkbox 
                                      checked={false}
                                      disabled={updateScheduleMutation.isPending || updateTaskStatusMutation.isPending}
                                      onCheckedChange={(checked) => {
                                        if (checked && entry?.id) {
                                          // Mark task as completed and remove from quarter
                                          if (task.type === 'regular') {
                                            // For regular tasks, update task status first, then chain schedule update
                                            updateTaskStatusMutation.mutate({
                                              taskId: task.id,
                                              status: 'completed',
                                              xDate: new Date(selectedDate + 'T00:00:00.000Z').toISOString(),
                                              scheduleUpdateData: {
                                                id: entry.id,
                                                actualTaskId: undefined,
                                                plannedTaskId: undefined,
                                                status: 'completed',
                                              }
                                            });
                                          } else if (task.type === 'recurring') {
                                            // Handle recurring tasks - check if it's part of MULTIPLE_TASKS
                                            if (entry.reflection?.startsWith('MULTIPLE_TASKS:')) {
                                              // Remove only this task from the multiple tasks list
                                              const taskNamesStr = entry.reflection.replace('MULTIPLE_TASKS:', '');
                                              const taskNames = taskNamesStr.split('|');
                                              const remainingTasks = taskNames.filter(name => name.trim() !== task.name);
                                              
                                              if (remainingTasks.length === 0) {
                                                // No tasks left, mark entry as completed
                                                updateScheduleMutation.mutate({
                                                  id: entry.id,
                                                  actualTaskId: undefined,
                                                  plannedTaskId: undefined,
                                                  reflection: undefined,
                                                  status: 'completed',
                                                });
                                              } else if (remainingTasks.length === 1) {
                                                // One task left, convert to single recurring task
                                                updateScheduleMutation.mutate({
                                                  id: entry.id,
                                                  reflection: `RECURRING_TASK:${remainingTasks[0]}`,
                                                });
                                              } else {
                                                // Multiple tasks still remain
                                                updateScheduleMutation.mutate({
                                                  id: entry.id,
                                                  reflection: `MULTIPLE_TASKS:${remainingTasks.join('|')}`,
                                                  status: 'not_started', // Keep status as not_started when tasks remain
                                                });
                                              }
                                            } else {
                                              // Single recurring task, mark schedule entry as completed
                                              updateScheduleMutation.mutate({
                                                id: entry.id,
                                                actualTaskId: undefined,
                                                plannedTaskId: undefined,
                                                reflection: undefined,
                                                status: 'completed',
                                              });
                                            }
                                          }
                                        }
                                      }}
                                      className="w-3 h-3 flex-shrink-0"
                                      data-testid={`checkbox-complete-${block.name}-${quartile}-${taskIndex}`}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                                </DraggableTask>
                                );
                              })}
                              
                              {/* Overflow indicator with tooltip */}
                              {hiddenCount > 0 && (
                                <div 
                                  className="flex items-center gap-1 p-1 rounded text-xs cursor-pointer hover:bg-secondary/50 text-muted-foreground"
                                  title={`${hiddenCount} more tasks: ${candidates.slice(4).map(t => t.name).join(', ')}`}
                                  data-testid={`button-more-tasks-${block.name}-${quartile}`}
                                >
                                  <span className="text-xs">📋 +{hiddenCount} more</span>
                                </div>
                              )}
                              
                              {/* Manual Add Task Button */}
                              {showAddTaskFor?.timeBlock === block.name && showAddTaskFor?.quartile === quartile ? (
                                // Show task selector when adding
                                <div className="mt-2 pt-1 border-t border-border/50">
                                  <Select 
                                    value=""
                                    onValueChange={async (taskId) => {
                                      if (taskId) {
                                        try {
                                          // Add task to existing quarter (will convert to MULTIPLE_TASKS if needed)
                                          const response = await apiRequest("POST", "/api/daily/add-to-quarter", {
                                            timeBlock: block.name,
                                            quartile: quartile,
                                            taskId: taskId,
                                            date: new Date(selectedDate + 'T00:00:00.000Z')
                                          });
                                          
                                          if (response.ok) {
                                            console.log('Successfully added task to quarter');
                                            // Invalidate cache to refresh the schedule data
                                            queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
                                            toast({
                                              title: "Task added successfully",
                                              description: `Added task to ${block.name} Q${quartile}`,
                                            });
                                            // Hide selector on success
                                            setShowAddTaskFor(null);
                                          } else {
                                            // Get the error message from the response
                                            const errorData = await response.json().catch(() => ({}));
                                            const errorMessage = errorData.message || "Could not add task to quarter";
                                            toast({
                                              title: "Failed to add task",
                                              description: errorMessage,
                                              variant: "destructive",
                                            });
                                            // Hide selector on error as well
                                            setShowAddTaskFor(null);
                                          }
                                        } catch (error) {
                                          console.error('Failed to add task to quarter:', error);
                                          toast({
                                            title: "Failed to add task", 
                                            description: error instanceof Error ? error.message : "Could not add task to quarter",
                                            variant: "destructive",
                                          });
                                          // Hide selector on exception
                                          setShowAddTaskFor(null);
                                        }
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-full text-xs h-6" data-testid={`select-add-task-${block.name.replace(/\s+/g, '-')}-${quartile}`}>
                                      <SelectValue placeholder="Add another task..." />
                                    </SelectTrigger>
                                    <SelectContent data-testid={`select-content-add-task-${block.name.replace(/\s+/g, '-')}-${quartile}`}>
                                      {tasks
                                        .filter(task => task.type === 'Task' || task.type === 'Subtask')
                                        .filter(task => {
                                          // Don't show tasks already in this quarter
                                          // For MULTIPLE_TASKS, check by name since candidates have generated IDs
                                          return !visibleTasks.some(vt => vt.id === task.id || vt.name?.toLowerCase().trim() === task.name?.toLowerCase().trim());
                                        })
                                        .map((task) => (
                                          <SelectItem key={task.id} value={task.id} data-testid={`select-item-add-task-${task.id}`}>
                                            {task.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full mt-1 h-5 text-xs"
                                    onClick={() => setShowAddTaskFor(null)}
                                    data-testid={`button-cancel-add-${block.name.replace(/\s+/g, '-')}-${quartile}`}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                // Show "+" button when not adding
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full mt-1 h-5 text-xs opacity-60 hover:opacity-100"
                                  onClick={() => setShowAddTaskFor({ timeBlock: block.name, quartile: quartile })}
                                  data-testid={`button-add-task-${block.name.replace(/\s+/g, '-')}-${quartile}`}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add Task
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                        </div>
                      </QuartileDropZone>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* AI Assistant */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Assistant</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={aiMessage}
                onChange={(e) => setAiMessage(e.target.value)}
                placeholder="How can I help with your schedule?"
                className="h-20 resize-none text-sm mb-3"
                data-testid="textarea-ai-message"
              />
              <Button 
                className="w-full" 
                size="sm"
                onClick={handleAiMessage}
                disabled={aiChatMutation.isPending}
                data-testid="button-ai-send"
              >
                Ask AI
              </Button>
            </CardContent>
          </Card>

          {/* Calorie Tracking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calorie Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Caloric Intake (from completed tasks):</span>
                <span className="text-sm font-medium text-green-600 min-w-[3rem] text-right" data-testid="text-caloric-intake">
                  {calculatedCaloricIntake}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Caloric Expenditure (from completed tasks):</span>
                <span className="text-sm font-medium text-orange-600 min-w-[3rem] text-right" data-testid="text-caloric-expenditure">
                  {calculatedCaloricExpenditure}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Base Expenditure:</span>
                <span className="text-sm font-medium text-red-600" data-testid="text-base-expenditure">-2300</span>
              </div>
              <hr className="border-border" />
              <div className="flex justify-between font-medium">
                <span className="text-sm text-foreground">Net Calories:</span>
                <span className={`text-sm ${
                  (calculatedCaloricIntake + calculatedCaloricExpenditure + baseExpenditure) >= 0 ? 'text-green-600' : 'text-red-600'
                }`} data-testid="text-net-calories-summary">{calculatedCaloricIntake + calculatedCaloricExpenditure + baseExpenditure}</span>
              </div>
            </CardContent>
          </Card>

          {/* Daily Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Tasks Completed</span>
                  <span className="font-medium" data-testid="text-tasks-completed">
                    {getCompletedTasks()} / {getTotalQuartiles()}
                  </span>
                </div>
                <Progress value={completionRate} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Time Tracked</span>
                  <span className="font-medium" data-testid="text-time-tracked">2.5h / 8h</span>
                </div>
                <Progress value={31.25} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Quick Capture */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Capture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full" data-testid="button-upload-image">
                <Camera className="mr-2 h-4 w-4" />
                Upload Image
              </Button>
              <Input
                value={quickTask}
                onChange={(e) => setQuickTask(e.target.value)}
                placeholder="Quick task..."
                onKeyDown={(e) => e.key === 'Enter' && handleQuickTaskSubmit()}
                data-testid="input-quick-task"
              />
              <Button 
                className="w-full" 
                size="sm"
                onClick={handleQuickTaskSubmit}
                disabled={createTaskMutation.isPending}
                data-testid="button-add-task"
              >
                Add Task
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Task Details Modal */}
      <Dialog open={isDetailsOpen} onOpenChange={handleCloseDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="title-task-details">
              Task Details
            </DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2" data-testid="text-task-name">
                  {selectedTask.name}
                </h3>
                {selectedTask.description && (
                  <p className="text-muted-foreground" data-testid="text-task-description">
                    {selectedTask.description}
                  </p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <Badge variant="outline" className="ml-2" data-testid="badge-task-priority">
                    {selectedTask.priority || 'Not set'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Badge variant="outline" className="ml-2" data-testid="badge-task-status">
                    {selectedTask.status || 'Not started'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-category">
                    {selectedTask.category || 'Uncategorized'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Subcategory</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-subcategory">
                    {selectedTask.subcategory || 'None'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Time Horizon</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-horizon">
                    {selectedTask.timeHorizon || 'Not set'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Assignee</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-assignee">
                    {selectedTask.assignee || 'Unassigned'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Estimated Time</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-estimated">
                    {selectedTask.estimatedTime ? `${selectedTask.estimatedTime} min` : 'Not set'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Actual Time</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-actual">
                    {selectedTask.actualTime ? `${selectedTask.actualTime} min` : 'Not recorded'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Due Date</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-due">
                    {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'No due date'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Completion Date</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-completion">
                    {selectedTask.xDate ? new Date(selectedTask.xDate).toLocaleDateString() : 'Not completed'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Progress</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-progress">
                    {selectedTask.progress || 0}%
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Calorie Impact</label>
                  <div className="text-sm" data-testid="text-task-calories">
                    <span className="text-green-600">+{selectedTask.caloriesIntake || 0}</span>
                    <span className="mx-1">/</span>
                    <span className="text-orange-600">-{selectedTask.caloriesExpenditure || 0}</span>
                  </div>
                </div>
              </div>
              
              {selectedTask.why && (
                <div>
                  <label className="text-sm font-medium block mb-2">Why this task matters</label>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded" data-testid="text-task-why">
                    {selectedTask.why}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove Task Confirmation Dialog */}
      <AlertDialog 
        open={removeTaskDialog?.open || false} 
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTaskDialog(null);
            setSkipRecurringToday(true); // Reset to default
          }
        }}
        data-testid="dialog-remove-task"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{removeTaskDialog?.task?.name}" from {removeTaskDialog?.timeBlock} Quartile {removeTaskDialog?.quartile}.
              {removeTaskDialog?.task?.type === 'recurring' && (
                <div className="mt-3">
                  <label className="flex items-center space-x-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={skipRecurringToday}
                      onCheckedChange={(checked) => setSkipRecurringToday(!!checked)}
                      data-testid="checkbox-skip-recurring"
                    />
                    <span>Also skip this recurring occurrence for today</span>
                  </label>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={updateScheduleMutation.isPending}
              onClick={() => {
                if (removeTaskDialog) {
                  handleRemoveTask({
                    ...removeTaskDialog,
                    skipRecurring: removeTaskDialog.task.type === 'recurring' ? skipRecurringToday : false
                  });
                  setRemoveTaskDialog(null);
                  setSkipRecurringToday(true);
                }
              }}
              data-testid="button-confirm-remove"
            >
              {updateScheduleMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Schedule Confirmation Dialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent data-testid="dialog-clear-schedule">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all tasks from your schedule for {(() => {
                const [year, month, day] = selectedDate.split('-');
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString();
              })()}. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={clearScheduleMutation.isPending}
              onClick={() => {
                clearScheduleMutation.mutate(selectedDate);
                setShowClearConfirm(false);
              }}
              data-testid="button-confirm-clear"
            >
              {clearScheduleMutation.isPending ? 'Clearing...' : 'Clear Schedule'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Chat Panel - Separate component for performance */}
      <AIChatPanel selectedDate={selectedDate} />
      </div>
    </DndProvider>
  );
}
