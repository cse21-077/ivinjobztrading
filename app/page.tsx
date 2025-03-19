"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, Server, Zap } from "lucide-react";

export default function MaintenancePage() {
  const [progress, setProgress] = useState(0);
  const [completedObjectives, setCompletedObjectives] = useState([false, false, false]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Total duration: 48 hours (2 days)
  const totalDuration = 48 * 60 * 60 * 1000;
  // Each objective completes after ~16 hours
  const objectiveInterval = totalDuration / 3;

  const objectives = [
    "Increasing server capacity for more users",
    "Optimizing server speed and performance",
    "Enabling ARM trades for all users",
  ];

  useEffect(() => {
    // Set the start time on the first render
    if (!startTime) {
      setStartTime(new Date());
    }
  }, [startTime]);

  useEffect(() => {
    if (startTime) {
      const timer = setInterval(() => {
        const now = new Date();
        setCurrentTime(now);

        // Calculate elapsed time
        const elapsedTime = now.getTime() - startTime.getTime();

        // Calculate progress percentage (0-100)
        const newProgress = Math.min(100, (elapsedTime / totalDuration) * 100);
        setProgress(newProgress);

        // Update completed objectives based on progress
        const newCompletedObjectives = [newProgress >= 33.33, newProgress >= 66.66, newProgress >= 100];
        setCompletedObjectives(newCompletedObjectives);

        // Clear interval when complete
        if (newProgress >= 100) {
          clearInterval(timer);
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [startTime, totalDuration]);

  // Calculate remaining time
  const remainingTime = startTime ? Math.max(0, totalDuration - (currentTime.getTime() - startTime.getTime())) : 0;
  const remainingHours = Math.floor(remainingTime / (60 * 60 * 1000));
  const remainingMinutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 space-y-6">
        <div className="text-center space-y-2">
          <Server className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">Server Maintenance</h1>
          <p className="text-gray-500">
            We're upgrading our servers to provide you with a better trading experience. Please check back later.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Upgrade Progress</span>
              <span className="text-sm font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="space-y-3 pt-2">
            {objectives.map((objective, index) => (
              <div key={index} className="flex items-center space-x-3">
                {completedObjectives[index] ? (
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                ) : (
                  <Clock className="h-5 w-5 text-gray-400 flex-shrink-0" />
                )}
                <span className={`text-sm ${completedObjectives[index] ? "text-gray-900" : "text-gray-500"}`}>
                  {objective}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
            <Zap className="h-4 w-4" />
            <span>
              Estimated time remaining: {remainingHours}h {remainingMinutes}m
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Thank you for your patience while we improve our services.</p>
        <p className="mt-1">Maintenance started: {startTime ? startTime.toLocaleString() : "Loading..."}</p>
      </div>
    </div>
  );
}
