import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import HeaderNavigation from "@/components/header-navigation";
import TaskCaptureInterface from "@/components/task-capture-interface";
import StrategicPlanningMatrix from "@/components/strategic-planning-matrix";
import DailyWorksheet from "@/components/daily-worksheet";
import RecurringTasksPage from "@/pages/recurring-tasks-page";
import AnalyticsDashboard from "@/pages/analytics-dashboard";

type TabType = "capture" | "planning" | "daily" | "recurring" | "analytics";

export default function HomePage() {
  const [location] = useLocation();
  
  // Determine initial tab from URL path
  const getInitialTab = (): TabType => {
    const path = location.replace("/", "");
    if (path === "capture" || path === "planning" || path === "daily" || path === "recurring" || path === "analytics") {
      return path as TabType;
    }
    return "capture"; // default
  };
  
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab());
  
  // Update tab when URL changes
  useEffect(() => {
    const newTab = getInitialTab();
    setActiveTab(newTab);
  }, [location]);

  return (
    <div className="min-h-screen bg-background">
      <HeaderNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "capture" && <TaskCaptureInterface />}
        {activeTab === "planning" && <StrategicPlanningMatrix />}
        {activeTab === "daily" && <DailyWorksheet />}
        {activeTab === "recurring" && <RecurringTasksPage />}
        {activeTab === "analytics" && <AnalyticsDashboard />}
      </main>
    </div>
  );
}
